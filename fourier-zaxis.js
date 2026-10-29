(function(){
console.log('📐 Z轴模块 v32.2 | 加法版预测线 + 技术指标融合');

var C = { fixedLen: 3000, topN: 5, forecastDays: 20 };
var prices = [], fullSpectrum = [], spectrum = [], prob = { up: 33, down: 33, flat: 34 };
var ribbon = { color: 'gray', trend: 'flat', strength: 0 };
var techInfo = { score: 0, detail: '' };

function getSymbol() {
    try { var i = document.getElementById('symbol'); return i && i.value ? i.value.trim().toUpperCase() : 'STK'; }
    catch(e) { return 'STK'; }
}

// ----- 获取价格数据 -----
function getChartInstance() {
    try {
        if (window.myChart && window.myChart.data) return window.myChart;
        if (window.priceChart && window.priceChart.data) return window.priceChart;
        var canvas = document.getElementById('priceChart');
        var chartApi = window.Chart;
        if (canvas && chartApi && typeof chartApi.getChart === 'function') {
            return chartApi.getChart(canvas) || null;
        }
    } catch(e) {
        console.warn('读取主图表失败:', e);
    }
    return null;
}

function getPrices() {
    try {
        var chart = getChartInstance();
        if (!chart || !chart.data || !Array.isArray(chart.data.datasets)) return [];
        var ds = chart.data.datasets;
        for (var i = 0; i < ds.length; i++) {
            var dataset = ds[i];
            if (!dataset || !Array.isArray(dataset.data)) continue;
            var lbl = String(dataset.label || '').toLowerCase();
            var points = dataset.data;
            var hasOhlc = points.some(function(point) {
                return point && typeof point === 'object' && point.c !== undefined;
            });
            if (!hasOhlc && !(lbl.indexOf('收盘') >= 0 || lbl === 'close' || lbl === '价格')) continue;
            var d = points.map(function(point) {
                var value;
                if (typeof point === 'number' || typeof point === 'string') value = Number(point);
                else if (point && typeof point === 'object') value = Number(point.c !== undefined ? point.c : point.y);
                else return null;
                return Number.isFinite(value) && value > 0 ? value : null;
            }).filter(function(value) { return value !== null; });
            if (d.length > 20) return d.length > C.fixedLen ? d.slice(-C.fixedLen) : d;
        }
        return [];
    } catch(e) {
        console.warn('无法读取真实K线收市价:', e);
        return [];
    }
}

// ---------- FFT ----------
function fft(r, i) {
    var N = r.length; if (N <= 1) return;
    var j = 0;
    for (var x = 0; x < N - 1; x++) {
        if (x < j) { var tr = r[x]; r[x] = r[j]; r[j] = tr; var ti = i[x]; i[x] = i[j]; i[j] = ti; }
        var k = N >> 1; while (k <= j) { j -= k; k >>= 1; } j += k;
    }
    for (var len = 2; len <= N; len <<= 1) {
        var ang = -2 * Math.PI / len, wl_re = Math.cos(ang), wl_im = Math.sin(ang);
        for (var x = 0; x < N; x += len) {
            var w_re = 1, w_im = 0;
            for (var y = 0; y < len/2; y++) {
                var u_re = r[x+y], u_im = i[x+y];
                var v_re = r[x+y+len/2] * w_re - i[x+y+len/2] * w_im;
                var v_im = r[x+y+len/2] * w_im + i[x+y+len/2] * w_re;
                r[x+y] = u_re + v_re; i[x+y] = u_im + v_im;
                r[x+y+len/2] = u_re - v_re; i[x+y+len/2] = u_im - v_im;
                var nw_re = w_re * wl_re - w_im * wl_im, nw_im = w_re * wl_im + w_im * wl_re;
                w_re = nw_re; w_im = nw_im;
            }
        }
    }
}

// ---------- 辅助统计 ----------
function mean(arr) { return arr.reduce(function(a,b){return a+b;},0)/arr.length; }
function stdDev(arr) {
    var m = mean(arr);
    return Math.sqrt(arr.reduce(function(s,v){return s+(v-m)*(v-m);},0)/arr.length);
}
function EMA(data, period) {
    var alpha = 2/(period+1), res = [data[0]];
    for (var i=1; i<data.length; i++) res.push(alpha*data[i] + (1-alpha)*res[i-1]);
    return res;
}

// ===================== 技术指标 =====================

function calcRSI(p, period) {
    period = period || 14;
    if (p.length < period + 1) return null;
    var gains = 0, losses = 0;
    for (var i = 1; i <= period; i++) {
        var d = p[i] - p[i-1];
        if (d >= 0) gains += d; else losses -= d;
    }
    var avgG = gains / period, avgL = losses / period;
    for (var i = period + 1; i < p.length; i++) {
        var d = p[i] - p[i-1];
        avgG = (avgG * (period-1) + Math.max(d,0)) / period;
        avgL = (avgL * (period-1) + Math.max(-d,0)) / period;
    }
    if (avgL === 0) return 100;
    return 100 - 100 / (1 + avgG / avgL);
}

function calcMACD(p) {
    if (p.length < 35) return null;
    var e12 = EMA(p, 12), e26 = EMA(p, 26);
    var dif = [];
    for (var i = 0; i < e12.length; i++) dif.push(e12[i] - e26[i]);
    var dea = EMA(dif, 9);
    var last = dif.length - 1;
    return { macd: dif[last], signal: dea[last], hist: (dif[last]-dea[last])*2 };
}

function calcATR(p, period) {
    period = period || 14;
    if (p.length < period + 1) return null;
    var trs = [];
    for (var i = 1; i < p.length; i++) trs.push(Math.abs(p[i] - p[i-1]));
    var atr = mean(trs.slice(0, period));
    for (var i = period; i < trs.length; i++)
        atr = (atr * (period-1) + trs[i]) / period;
    return atr;
}

function calcBollingerPos(p, period, mult) {
    period = period || 20; mult = mult || 2;
    if (p.length < period) return null;
    var seg = p.slice(-period);
    var m = mean(seg), sd = stdDev(seg);
    if (sd === 0) return 0.5;
    return (p[p.length-1] - (m - mult*sd)) / (2 * mult * sd);
}

function calcTechScore(p) {
    var score = 0, parts = [];
    var rsi = calcRSI(p);
    if (rsi !== null) {
        var r = rsi < 30 ? 30 : (rsi > 70 ? -30 : (50 - rsi));
        score += r; parts.push('RSI:' + rsi.toFixed(0));
    }
    var macd = calcMACD(p);
    if (macd) {
        score += macd.hist > 0 ? 25 : -25;
        parts.push('MACD:' + macd.hist.toFixed(2));
    }
    var bpos = calcBollingerPos(p);
    if (bpos !== null) {
        var bv = bpos > 1 ? -20 : (bpos < 0 ? 20 : (0.5 - bpos) * 40);
        score += bv; parts.push('%B:' + bpos.toFixed(2));
    }
    var atr = calcATR(p);
    if (atr !== null) parts.push('ATR:' + atr.toFixed(2));
    return { score: Math.max(-100, Math.min(100, score)), detail: parts.join(' | ') };
}

// ---------- 频谱（对数收益率 + Hanning窗）----------
function getSpectrum(p) {
    if (p.length < 32) return [];
    var ret = [];
    for (var i = 1; i < p.length; i++) {
        if (p[i-1] > 0) ret.push(Math.log(p[i] / p[i-1]));
    }
    var n = ret.length;
    if (n < 32) return [];
    var m = mean(ret);
    var std = Math.max(stdDev(ret), 0.000001);

    var size = 1; while (size < n) size <<= 1;
    var re = [], im = [];
    for (var i = 0; i < size; i++) { re.push(0); im.push(0); }
    var winSumSq = 0;
    for (var i = 0; i < n; i++) {
        var w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        winSumSq += w * w;
        re[i] = (ret[i] - m) * w;
    }
    fft(re, im);

    var amps = [];
    for (var i = 1; i < n / 2; i++) {
        var raw = Math.sqrt(re[i]*re[i] + im[i]*im[i]);
        var rel = Math.min(raw / std / Math.sqrt(winSumSq || 1), 2.0);
        var period = n / i;
        if (period >= 3 && period <= 250) {
            amps.push({ period: Math.round(period), amplitude: rel,
                        phase: Math.atan2(im[i], re[i]) });
        }
    }
    amps.sort(function(a,b){ return b.amplitude - a.amplitude; });
    return amps;
}

// ---------- 彩带 ----------
function calcRibbon(p) {
    if (p.length < 50) return { color: 'gray', trend: 'flat', strength: 0 };
    var ema10 = EMA(p, 10);
    var ema20 = EMA(p, 20);
    var ema50 = EMA(p, 50);
    var cur10 = ema10[ema10.length-1], cur20 = ema20[ema20.length-1], cur50 = ema50[ema50.length-1];
    var prev10 = ema10[ema10.length-2];
    var vol = stdDev(p.slice(-20)) / mean(p.slice(-20));
    var thresh = Math.max(0.0005, vol * 0.5);
    var color = 'gray';
    if (cur10 > cur20 && cur20 > cur50) color = 'red';
    else if (cur10 < cur20 && cur20 < cur50) color = 'green';
    var slope = (cur10 - prev10) / prev10;
    var trend = slope > thresh ? 'up' : (slope < -thresh ? 'down' : 'flat');
    var strength = Math.min(100, Math.abs(cur10 - cur50) / cur50 * 500);
    return { color: color, trend: trend, strength: strength };
}

// ---------- ISET 方向（三源融合）----------
function computeISETDirection(fullSpec, topN, p) {
    if (!fullSpec.length || p.length < 35) return 0;
    var last20 = p.slice(-20);
    var slopeDir = Math.max(-1, Math.min(1,
        (last20[last20.length-1] - last20[0]) / last20[0] * 10));
    var tech = calcTechScore(p);
    techInfo = tech;
    var techDir = tech.score / 100;
    var totalE = fullSpec.slice(0, topN).reduce(function(s,a){ return s+a.amplitude; },0);
    var specBias = totalE > 0.8 ? 0 : (totalE > 0.3 ? slopeDir * 0.5 : slopeDir);
    return slopeDir * 0.4 + techDir * 0.4 + specBias * 0.2;
}

// ---------- 概率 ----------
function probabilityFromDirection(dir) {
    dir = Math.max(-1, Math.min(1, dir));
    var up = 50 + dir * 35;
    up = Math.min(85, Math.max(15, up));
    var flat = 20 + (1 - Math.abs(dir)) * 30;
    flat = Math.min(50, Math.max(10, flat));
    var down = 100 - up - flat;
    down = Math.min(85, Math.max(5, down));
    var total = up + down + flat;
    up = up / total * 100; down = down / total * 100; flat = flat / total * 100;
    return { up: Math.round(up), down: Math.round(down), flat: Math.round(flat) };
}

// ---------- 全息预测线（加法版，不会飞走）----------
function computeHologramLine(p, periods, days, totalEnergy) {
    var last = p[p.length-1];
    var flatArr = [];
    if (!periods.length || !last || !isFinite(last)) {
        for (var k = 0; k < days; k++) flatArr.push(last || 0);
        return flatArr;
    }
    var n = p.length;

    // 近期趋势（带保护，限制在 ±1%/天）
    var lookback = Math.min(20, n - 1);
    var basePrice = p[n-1-lookback];
    if (!basePrice || basePrice <= 0) basePrice = last;
    var dailyRet = Math.log(last / basePrice) / lookback;
    if (!isFinite(dailyRet)) dailyRet = 0;
    dailyRet = Math.max(-0.01, Math.min(0.01, dailyRet));

    var norm = periods.reduce(function(s,a){ return s+a.amplitude; },0) || 1;
    var intensity = Math.min(0.4, totalEnergy / 2.0);
    var recentVol = stdDev(p.slice(-20)) / mean(p.slice(-20));
    if (!isFinite(recentVol)) recentVol = 0.02;

    // 加法版：以现价为中心小幅波动
    var pred = [];
    for (var d = 1; d <= days; d++) {
        var osc = 0;
        for (var i = 0; i < periods.length; i++) {
            var per = periods[i].period;
            var amp = periods[i].amplitude / norm;
            osc += amp * Math.cos(2 * Math.PI * (n - 1 + d) / per + periods[i].phase);
        }
        var change = last * dailyRet * d + last * recentVol * osc * intensity * 0.5;
        var val = last + change;
        if (!isFinite(val)) val = last;
        pred.push(parseFloat(val.toFixed(2)));
    }
    return pred;
}

// ---------- 绘制彩带 ----------
function drawRibbonBar(rib) {
    var cv = document.getElementById('ribbonCanvas');
    if (!cv) {
        var can = document.querySelector('canvas');
        if (can) {
            var div = document.createElement('div'); div.style.margin = '8px 0';
            div.innerHTML = '<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
            can.parentElement.insertBefore(div, can.nextSibling);
        } else {
            var panel = document.getElementById('fourierPanel');
            if (panel) {
                var div2 = document.createElement('div'); div2.style.margin = '8px 0';
                div2.innerHTML = '<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
                panel.appendChild(div2);
            }
        }
    }
    cv = document.getElementById('ribbonCanvas');
    if (!cv) return;
    cv.width = cv.parentElement.clientWidth || 800;
    cv.height = 40;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = rib.color === 'red' ? '#f87171'
                  : rib.color === 'green' ? '#4ade80' : '#94a3b8';
    ctx.fillRect(0, 0, cv.width, 40);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('彩带: ' + rib.color + ' | 趋势: ' + rib.trend + ' | 强度: ' + Math.round(rib.strength) + '%', 10, 25);
}

// ---------- 绘制预测线 ----------
function drawHologram() {
    if (!window.myChart) return;
    var ds = window.myChart.data.datasets, orig = null;
    for (var i=0; i<ds.length; i++) {
        var l = ds[i].label || '';
        if ((l.indexOf('收盘') >= 0 || l === 'close') && ds[i].data) { orig = ds[i].data; break; }
    }
    if (!orig || orig.length < 20) return;
    var topPeriods = spectrum;
    var totalEnergy = topPeriods.reduce(function(s,p){ return s+p.amplitude; },0);
    var forecast = computeHologramLine(prices, topPeriods, C.forecastDays, totalEnergy);
    var full = [];
    for (var i=0; i<orig.length; i++) full.push(null);
    for (var i=0; i<forecast.length; i++) full.push(forecast[i]);
    var idx = -1;
    for (var i=0; i<ds.length; i++) if (ds[i].label === '🔮 全息预测线') { idx = i; break; }
    if (idx >= 0) ds[idx].data = full;
    else ds.push({ label: '🔮 全息预测线', data: full, borderColor: '#a855f7', borderWidth: 2, borderDash: [8,4], pointRadius: 0, fill: false, tension: 0.1 });
    window.myChart.update();
}

// ---------- 刷新全部 ----------
function refreshAll() {
    try {
        var raw = getPrices();
        if (!raw.length) {
            prices = [];
            fullSpectrum = [];
            spectrum = [];
            ribbon = { color: 'gray', trend: 'flat', strength: 0 };
            techInfo = { score: 0, detail: '' };
            updatePanel();
            drawRibbonBar(ribbon);
            console.warn('未取得真实K线数据，已停止生成指标信号。');
            return;
        }
        prices = raw.length > C.fixedLen ? raw.slice(-C.fixedLen) : raw;
        fullSpectrum = getSpectrum(prices);
        spectrum = fullSpectrum.slice(0, C.topN);
        ribbon = calcRibbon(prices);
        var dir = computeISETDirection(fullSpectrum, C.topN, prices);
        prob = probabilityFromDirection(dir);
        updatePanel();
        drawRibbonBar(ribbon);
        drawHologram();
        console.log('刷新完成，上升概率:', prob.up, '| 技术评分:', techInfo.score);
    } catch(e) { console.error(e); }
}

// ---------- 更新面板 ----------
function updatePanel() {
    var panel = document.getElementById('fourierPanel');
    if (!panel) {
        panel = document.createElement('div'); panel.id = 'fourierPanel';
        panel.style.cssText = 'margin:16px;padding:16px;background:#1e293b;border-radius:16px;border:1px solid #334155';
        var c = document.querySelector('.container') || document.body;
        c.insertBefore(panel, c.firstChild);
        var ribbonDiv = document.createElement('div'); ribbonDiv.style.margin = '8px 0';
        ribbonDiv.innerHTML = '<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
        panel.appendChild(ribbonDiv);
        var contentDiv = document.createElement('div'); contentDiv.id = 'fourierContent';
        panel.appendChild(contentDiv);
    }
    var sym = getSymbol();
    if (!prices.length) {
        var waitingContent = document.getElementById('fourierContent');
        if (waitingContent) {
            waitingContent.innerHTML = '<div style="display:flex;justify-content:space-between"><h3 style="color:#facc15;margin:0">📐 Z轴｜' + sym + '</h3><button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white">🔄</button></div>' +
                '<div style="margin-top:12px;color:#fbbf24">未取得真实K线数据，暂不生成指标分数或方向机率。</div>';
            var waitingBtn = document.getElementById('refreshBtn');
            if (waitingBtn) waitingBtn.onclick = function() { refreshAll(); };
        }
        return;
    }
    var topHtml = '';
    for (var i=0; i<spectrum.length; i++) {
        var s = spectrum[i];
        var ampPercent = (s.amplitude * 100).toFixed(1);
        topHtml += '<span style="background:#facc15;color:#0f172a;padding:4px 12px;border-radius:20px;margin:4px;font-weight:bold">' + s.period + '天 (' + ampPercent + '%)</span>';
    }
    var ribbonText = ribbon.color === 'red' ? '🔴 红色'
                   : ribbon.color === 'green' ? '🟢 绿色' : '⚪ 灰色';
    ribbonText += ribbon.trend === 'up' ? ' ↑' : (ribbon.trend === 'down' ? ' ↓' : ' —');
    var techColor = techInfo.score > 15 ? '#4ade80' : (techInfo.score < -15 ? '#f87171' : '#94a3b8');
    var techSign = techInfo.score > 0 ? '+' : '';
    var html = '';
    html += '<div style="display:flex;justify-content:space-between">';
    html += '<h3 style="color:#facc15;margin:0">📐 Z轴｜' + sym + '</h3>';
    html += '<button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white">🔄</button></div>';
    html += '<div style="margin:12px 0">🎯 ISET 核心周期 (Top' + C.topN + '): ' + topHtml + '</div>';
    html += '<div style="display:flex;gap:20px;flex-wrap:wrap">';
    html += '<div><div style="color:#facc15;font-size:0.7rem">📊 未来5日概率</div>';
    html += '<div><span style="color:#4ade80">▲ ' + prob.up + '%</span> ';
    html += '<span style="color:#f87171">▼ ' + prob.down + '%</span> ';
    html += '<span style="color:#94a3b8">— ' + prob.flat + '%</span></div></div>';
    html += '<div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带状态</div>';
    html += '<div>' + ribbonText + ' | 强度:' + Math.round(ribbon.strength) + '%</div></div>';
    html += '<div><div style="color:#94a3b8;font-size:0.7rem">📈 技术指标评分</div>';
    html += '<div style="color:' + techColor + ';font-weight:bold">' + techSign + techInfo.score + '</div>';
    html += '<div style="font-size:0.6rem;color:#64748b">' + techInfo.detail + '</div></div>';
    html += '</div>';
    html += '<div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ 收益率FFT+Hanning窗 | 三源融合方向 | RSI/MACD/%B/ATR</div>';
    var contentDiv = document.getElementById('fourierContent');
    if (contentDiv) {
        contentDiv.innerHTML = html;
        var btn = document.getElementById('refreshBtn');
        if (btn) btn.onclick = function() { refreshAll(); };
    }
}

// ---------- 初始化（防重复监听）----------
function init() {
    refreshAll();
    if (window.__zaxisBound) return;
    window.__zaxisBound = true;
    var inp = document.getElementById('symbol');
    if (inp) inp.addEventListener('change', function() { setTimeout(refreshAll, 1500); });
    var btns = document.querySelectorAll('button');
    for (var i=0; i<btns.length; i++) {
        var t = btns[i].innerText || '';
        if (t.indexOf('分析') >= 0) {
            btns[i].addEventListener('click', function() { setTimeout(refreshAll, 2000); });
        }
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();

// 142857 / 1836.15 时空双重共振锁（完全体重构版）
(function attachCosmicReversalSignal() {
  const TIME_WINDOWS = Object.freeze([14, 28, 57, 142, 285, 571]);
  const TIME_TOLERANCE_BARS = 1;
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  const INDEX_LEVELS = Object.freeze([1.836, 18.36, 36.72]);
  const STOCK_LEVELS = Object.freeze([14.28, 18.36, 28.57, 36.72, 57.14]);
  const SPACE_TOLERANCE_PERCENT = 1.5; // ±1.5% 引力容错窗口

  const INDEX_SYMBOLS = new Set([
    'DJI', '^DJI', 'GSPC', '^GSPC', 'SPX', '^SPX', 'NDX', '^NDX',
    'IXIC', '^IXIC', 'HSI', '^HSI', 'N225', '^N225', '000001.SH', '399001.SZ'
  ]);

  function isPlaceholderValue(val) {
    if (val === null || val === undefined || val === '') return true;
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return true;
    // 彻底过滤输入框初始预设值 1836.15 或 0.08 的占位污染
    if (Math.abs(num - 1836.15) < 0.0001 || Math.abs(num - 0.08) < 0.0001) return true;
    return false;
  }

  function matchesTimeWindow(distance) {
    return TIME_WINDOWS.some(function(windowSize) {
      return Math.abs(distance - windowSize) <= TIME_TOLERANCE_BARS;
    });
  }

  function readBar(bar) {
    if (!bar || typeof bar !== 'object') return null;
    const open = Number(bar.o !== undefined ? bar.o : bar.open);
    const high = Number(bar.h !== undefined ? bar.h : bar.high);
    const low = Number(bar.l !== undefined ? bar.l : bar.low);
    const close = Number(bar.c !== undefined ? bar.c : bar.close);

    // 严密检查数值合法性及占位异常
    if (![open, high, low, close].every(Number.isFinite)) return null;
    if (open <= 0 || close <= 0 || high <= 0 || low <= 0) return null;
    if (isPlaceholderValue(close) || isPlaceholderValue(open)) return null;
    if (high < low || high < Math.max(open, close) || low > Math.min(open, close)) return null;

    return { open: open, high: high, low: low, close: close };
  }

  function readTime(bar) {
    if (!bar) return null;
    const raw = bar.timestamp !== undefined && bar.timestamp !== null ? bar.timestamp : bar.date;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw < 1000000000000 ? raw * 1000 : raw;
    }
    if (raw === undefined || raw === null) return null;
    const parsed = Date.parse(String(raw));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function yearWindowStart(data, index, period) {
    const lookbackYears = period === 'monthly' ? 18 : (period === 'weekly' ? 8 : 3);
    const now = readTime(data[index]);
    if (now !== null) {
      const cutoff = now - (YEAR_MS * lookbackYears);
      let start = index;
      while (start > 0) {
        const priorTime = readTime(data[start - 1]);
        if (priorTime === null || priorTime < cutoff) break;
        start -= 1;
      }
      return start;
    }
    const barsPerYear = period === 'monthly' ? 12 : (period === 'weekly' ? 52 : (period === '5min' ? 19656 : 252));
    return Math.max(0, index - (barsPerYear * lookbackYears));
  }

  function findAnchor(data, start, end, field, highest) {
    let anchor = null;
    for (let i = start; i < end; i += 1) {
      const values = readBar(data[i]);
      if (!values) continue;
      const value = values[field];
      if (!anchor || (highest ? value > anchor.price : value < anchor.price)) {
        anchor = {
          index: i,
          price: value,
          date: data[i].date !== undefined ? data[i].date : data[i].timestamp
        };
      }
    }
    return anchor;
  }

  function assetProfile(ticker, assetType) {
    const symbol = String(ticker || '').trim().toUpperCase();
    const type = String(assetType || '').trim().toLowerCase();
    const preciousMetal = /^(XAU|XAG|GOLD|SILVER|GLD|SLV|GC=F|SI=F)/.test(symbol) || type === 'precious-metal';
    const isIndex = type === 'index' || INDEX_SYMBOLS.has(symbol);
    const profile = isIndex ? 'index' : (preciousMetal ? 'precious-metal' : 'stock-or-commodity');
    return {
      profile: profile,
      levels: isIndex || preciousMetal ? INDEX_LEVELS : STOCK_LEVELS,
      longTermLow: isIndex
    };
  }

  /**
   * 【檢測拆股跳空並自動前復權回溯調整函數】
   * 
   * 核心邏輯：
   * 1. 檢測相鄰交易日之間因拆股（Stock Split）導致的超過 40% 的非自然價格暴跌（如 1:2, 1:3, 1:4, 1:5, 1:10 等），
   *    或因合股（Reverse Split）導致的超過 66% 的非自然暴漲。
   * 2. 計算精確拆股比率 (factor = curr.open / prev.close)，優先對齊標準金融拆股比例（容錯 ±6%）。
   * 3. 確保價格連續性：將拆股發生日之前的所有歷史 K 線 (0 到 i-1) 的開高低收價格統一乘以該比例進行前復權 (Backward-Adjusted)，
   *    並將成交量做等比反向調整，維持成交總市值守恆。
   * 4. 徹底消除圖表垂直斷裂線，保證 1836.15 及 142857 重力容錯計算不受斷層偽信號干擾。
   */
  function adjustKlinesForSplits(klines) {
    if (!Array.isArray(klines) || klines.length < 2) return klines;

    var adjusted = klines.map(function(k) {
      if (typeof k === 'object' && k !== null) {
        return Object.assign({}, k);
      }
      return k;
    });

    for (var i = 1; i < adjusted.length; i++) {
      var prev = readBar(adjusted[i - 1]);
      var curr = readBar(adjusted[i]);

      if (!prev || !curr || prev.close <= 0 || curr.open <= 0) continue;

      var ratio = curr.open / prev.close;
      var isSplitDrop = ratio < 0.60;
      var isReverseSplit = ratio > 1.66;

      if (isSplitDrop || isReverseSplit) {
        var commonSplitRatios = [
          1 / 2,   // 2-for-1 (0.50)
          1 / 3,   // 3-for-1 (0.3333)
          1 / 4,   // 4-for-1 (0.25)
          1 / 5,   // 5-for-1 (0.20 如 TSLA 2020)
          1 / 7,   // 7-for-1 (0.1428 如 AAPL 2014)
          1 / 8,   // 8-for-1 (0.125)
          1 / 10,  // 10-for-1 (0.10 如 NVDA 2024)
          1 / 15,  // 15-for-1 (0.0667)
          1 / 20,  // 20-for-1 (0.05 如 AMZN / GOOGL 2022)
          2 / 1,   // 1-for-2 反向合股
          3 / 1,   // 1-for-3 反向合股
          4 / 1,   // 1-for-4 反向合股
          5 / 1,   // 1-for-5 反向合股
          10 / 1   // 1-for-10 反向合股
        ];

        var factor = ratio;
        for (var k = 0; k < commonSplitRatios.length; k++) {
          var std = commonSplitRatios[k];
          if (Math.abs(ratio - std) / std <= 0.06) {
            factor = std;
            break;
          }
        }

        for (var j = 0; j < i; j++) {
          var barObj = adjusted[j];
          if (barObj && typeof barObj === 'object') {
            if (barObj.o !== undefined) barObj.o = Number((barObj.o * factor).toFixed(4));
            if (barObj.open !== undefined) barObj.open = Number((barObj.open * factor).toFixed(4));
            if (barObj.h !== undefined) barObj.h = Number((barObj.h * factor).toFixed(4));
            if (barObj.high !== undefined) barObj.high = Number((barObj.high * factor).toFixed(4));
            if (barObj.l !== undefined) barObj.l = Number((barObj.l * factor).toFixed(4));
            if (barObj.low !== undefined) barObj.low = Number((barObj.low * factor).toFixed(4));
            if (barObj.c !== undefined) barObj.c = Number((barObj.c * factor).toFixed(4));
            if (barObj.close !== undefined) barObj.close = Number((barObj.close * factor).toFixed(4));

            if (factor > 0) {
              if (barObj.vol !== undefined) barObj.vol = Math.round(barObj.vol / factor);
              if (barObj.volume !== undefined) barObj.volume = Math.round(barObj.volume / factor);
            }
          }
        }
      }
    }

    return adjusted;
  }

  function calculateCosmicReversalSignal(klineData, currentPeriod, ticker, assetType) {
    if (!Array.isArray(klineData) || klineData.length === 0) return [];

    // ==========================================
    // 1. 【彻底过滤垂直断裂线】
    // 严格检查并剔除结尾与中间的无效占位棒线（0、空串、1836.15、0.08）
    // ==========================================
    const cleanKlines = [];
    for (let idx = 0; idx < klineData.length; idx += 1) {
      const bar = klineData[idx];
      const parsed = readBar(bar);
      if (parsed) {
        cleanKlines.push(bar);
      }
    }

    // 进一步防范末端伪造断裂棒
    while (cleanKlines.length > 0) {
      const lastBar = cleanKlines[cleanKlines.length - 1];
      const parsed = readBar(lastBar);
      if (!parsed || isPlaceholderValue(parsed.close) || isPlaceholderValue(parsed.open)) {
        cleanKlines.pop();
      } else {
        break;
      }
    }

    if (cleanKlines.length === 0) return [];

    // ==========================================
    // 2. 【前復權與拆股跳空自動修正】
    // 檢測相鄰超過 40% 的非自然價格暴跌並向前復權調整，確保價格連續性
    // ==========================================
    const processedKlines = adjustKlinesForSplits(cleanKlines);

    const period = String(currentPeriod || 'daily').toLowerCase();
    const asset = assetProfile(ticker, assetType);
    const results = [];

    // ==========================================
    // 3. 【实现引力容错窗口，解锁买卖提示】
    // ==========================================
    for (let i = 0; i < processedKlines.length; i += 1) {
      const bar = processedKlines[i];
      const current = readBar(bar);
      const hold = {
        date: bar && (bar.date !== undefined ? bar.date : bar.timestamp),
        close: current ? current.close : null,
        signal: 'HOLD',
        support: null,
        resistance: null,
        timeResonance: false,
        spaceResonance: false,
        matchedThreshold: null,
        anchor: null,
        assetClass: asset.profile
      };

      if (!current || i < 2) {
        results.push(hold);
        continue;
      }

      const start = yearWindowStart(processedKlines, i, period);
      const highAnchor = findAnchor(processedKlines, start, i, 'high', true);
      const lowStart = asset.longTermLow ? 0 : start;
      const lowAnchor = findAnchor(processedKlines, lowStart, i, 'low', false);
      const previous = readBar(processedKlines[i - 1]);
      const prior = i > 1 ? readBar(processedKlines[i - 2]) : null;

      if (!highAnchor || !lowAnchor || highAnchor.price <= 0 || lowAnchor.price <= 0 || !previous || !prior) {
        results.push(hold);
        continue;
      }

      const barsFromHigh = i - highAnchor.index;
      const barsFromLow = i - lowAnchor.index;
      const buyTimeMatch = matchesTimeWindow(barsFromHigh);
      const sellTimeMatch = matchesTimeWindow(barsFromLow);

      // 形态确认
      const downtrend = previous.close < prior.close && previous.close < highAnchor.price;
      const uptrend = previous.close > prior.close && previous.close > lowAnchor.price;
      const bullishReversal = downtrend && current.close > current.open && current.close > previous.close;
      const bearishReversal = uptrend && current.close < current.open && current.close < previous.close;

      const support = highAnchor.price * (1 - asset.levels[0] / 100);
      const resistance = lowAnchor.price * (1 + asset.levels[0] / 100);

      let signal = 'HOLD';
      let matchedThreshold = null;
      let spaceResonance = false;

      // STRONG BUY：时间窗口共振 + 空间引力容错窗口(±1.5%) + 支撑位企稳收复
      if (buyTimeMatch && (bullishReversal || current.close > current.open)) {
        const drawdownLow = ((highAnchor.price - current.low) / highAnchor.price) * 100;
        const drawdownClose = ((highAnchor.price - current.close) / highAnchor.price) * 100;

        const matchedLevel = asset.levels.find(function(lvl) {
          return (
            Math.abs(drawdownLow - lvl) <= SPACE_TOLERANCE_PERCENT ||
            Math.abs(drawdownClose - lvl) <= SPACE_TOLERANCE_PERCENT
          );
        });

        if (matchedLevel !== undefined) {
          const supportLevel = highAnchor.price * (1 - (matchedLevel + SPACE_TOLERANCE_PERCENT) / 100);
          if (current.close >= supportLevel) {
            signal = 'STRONG_BUY';
            matchedThreshold = matchedLevel;
            spaceResonance = true;
          }
        }
      }

      // CRITICAL SELL：时间窗口共振 + 空间引力容错窗口(±1.5%) + 阻力位受阻回落
      if (sellTimeMatch && (bearishReversal || current.close < current.open)) {
        const reboundHigh = ((current.high - lowAnchor.price) / lowAnchor.price) * 100;
        const reboundClose = ((current.close - lowAnchor.price) / lowAnchor.price) * 100;

        const matchedLevel = asset.levels.find(function(lvl) {
          return (
            Math.abs(reboundHigh - lvl) <= SPACE_TOLERANCE_PERCENT ||
            Math.abs(reboundClose - lvl) <= SPACE_TOLERANCE_PERCENT
          );
        });

        if (matchedLevel !== undefined) {
          const resistanceLevel = lowAnchor.price * (1 + (matchedLevel - SPACE_TOLERANCE_PERCENT) / 100);
          if (current.close <= resistanceLevel || current.high >= resistanceLevel) {
            if (signal === 'STRONG_BUY') {
              signal = 'HOLD';
              matchedThreshold = null;
            } else {
              signal = 'CRITICAL_SELL';
              matchedThreshold = matchedLevel;
            }
            spaceResonance = true;
          }
        }
      }

      results.push({
        date: bar.date !== undefined ? bar.date : bar.timestamp,
        close: current.close,
        signal: signal,
        support: support,
        resistance: resistance,
        timeResonance: buyTimeMatch || sellTimeMatch,
        spaceResonance: spaceResonance,
        matchedThreshold: matchedThreshold,
        anchor: signal === 'STRONG_BUY' ? highAnchor : (signal === 'CRITICAL_SELL' ? lowAnchor : null),
        barsFromHigh: barsFromHigh,
        barsFromLow: barsFromLow,
        assetClass: asset.profile
      });
    }

    return results;
  }

  function getAdaptiveWindowSize(timeframe) {
    var tf = String(timeframe || '').toLowerCase();
    switch (tf) {
      case '5m':
      case '5min':
        return 12;
      case '1d':
      case 'daily':
        return 5;
      case '1w':
      case 'weekly':
        return 4;
      case '1m':
      case 'monthly':
        return 3;
      default:
        return 8;
    }
  }

  function calculateDynamicReversals(activeData, timeframe, supportLevels, resistanceLevels) {
    if (!activeData || activeData.length === 0) return { highs: [], lows: [] };
    timeframe = timeframe || '1d';
    supportLevels = supportLevels || [];
    resistanceLevels = resistanceLevels || [];

    var windowSize = getAdaptiveWindowSize(timeframe);
    var highs = [];
    var lows = [];
    var tolerance = 0.015;

    for (var i = 0; i < activeData.length; i++) {
      var start = Math.max(0, i - windowSize);
      var end = Math.min(activeData.length - 1, i + windowSize);

      var currentBar = activeData[i];
      var currentHigh = Number.isFinite(currentBar.h) ? currentBar.h : Number(currentBar.high || currentBar.c || 0);
      var currentLow = Number.isFinite(currentBar.l) ? currentBar.l : Number(currentBar.low || currentBar.c || 0);
      var currentClose = Number.isFinite(currentBar.c) ? currentBar.c : Number(currentBar.close || 0);

      var isLocalHigh = true;
      var isLocalLow = true;

      for (var j = start; j <= end; j++) {
        var b = activeData[j];
        var h = Number.isFinite(b.h) ? b.h : Number(b.high || b.c || 0);
        var l = Number.isFinite(b.l) ? b.l : Number(b.low || b.c || 0);
        if (h > currentHigh) isLocalHigh = false;
        if (l < currentLow) isLocalLow = false;
      }

      var gyHigh = (Math.abs(Math.floor(currentHigh)) % 9) || 9;
      var gyLow = (Math.abs(Math.floor(currentLow)) % 9) || 9;

      var effectiveSupports = supportLevels.slice();
      if (currentBar.supportLine1 && currentBar.supportLine1 > 0) effectiveSupports.push(currentBar.supportLine1);
      if (currentBar.supportLine2 && currentBar.supportLine2 > 0) effectiveSupports.push(currentBar.supportLine2);
      if (currentBar.reversalSupport && currentBar.reversalSupport > 0) effectiveSupports.push(currentBar.reversalSupport);

      var effectiveResistances = resistanceLevels.slice();
      if (currentBar.resistanceLine && currentBar.resistanceLine > 0) effectiveResistances.push(currentBar.resistanceLine);
      if (currentBar.reversalResistance && currentBar.reversalResistance > 0) effectiveResistances.push(currentBar.reversalResistance);

      var isAtSupport = effectiveSupports.some(function(level) {
        return Math.abs(currentLow - level) / level <= tolerance ||
               Math.abs(currentClose - level) / level <= tolerance ||
               currentLow <= level;
      });

      var isAtResistance = effectiveResistances.some(function(level) {
        return Math.abs(currentHigh - level) / level <= tolerance ||
               Math.abs(currentClose - level) / level <= tolerance ||
               currentHigh >= level;
      });

      if (isLocalHigh && (isAtResistance || gyHigh === 3 || gyHigh === 6 || gyHigh === 9 || currentBar.sellSignal || currentBar.reversalSignal === 'CRITICAL_SELL')) {
        highs.push({
          index: i,
          price: currentHigh,
          label: isAtResistance ? '強阻力高位' : '天花板',
          isStrong: isAtResistance || Boolean(currentBar.sellSignal),
          date: currentBar.date
        });
      }

      if (isLocalLow && (isAtSupport || gyLow === 3 || gyLow === 6 || gyLow === 9 || currentBar.buySignal || currentBar.reversalSignal === 'STRONG_BUY')) {
        lows.push({
          index: i,
          price: currentLow,
          label: isAtSupport ? '強支撐地板' : '地板價',
          isStrong: isAtSupport || Boolean(currentBar.buySignal),
          date: currentBar.date
        });
      }
    }

    return { highs: highs, lows: lows };
  }

  if (typeof window !== 'undefined') {
    window.calculateCosmicReversalSignal = calculateCosmicReversalSignal;
    window.calculateCosmicSignal = calculateCosmicReversalSignal;
    window.getAdaptiveWindowSize = getAdaptiveWindowSize;
    window.calculateDynamicReversals = calculateDynamicReversals;
  }
})();
