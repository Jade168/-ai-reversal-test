// 重現檢查：TS 版 R7＋C3b＋zigzag 對 Python v5 版（同一批烘焙檔輸入）。
// 用法：npx tsx scripts/verify-qqp-model-signals.ts [2380 2476 ...]
// 對照：/tmp/qqp-ts-check.py（Python 版，同一批 public/data/*.json 輸入）。
// 只讀檔、只印數字，唔改任何生產檔案。
import * as fs from 'node:fs';
import * as path from 'node:path';
import { aggregateWeeklyMonday, computeQqpModelLayer, type QqpBar } from '../src/services/qqpModelSignals';

const codes = process.argv.slice(2);
const list = codes.length > 0 ? codes : ['2380', '2476'];
const dataDir = path.resolve(process.cwd(), 'public/data');

for (const code of list) {
  const file = path.join(dataDir, `${code}.json`);
  if (!fs.existsSync(file)) {
    console.log(`${code}: 無烘焙檔 ${file}`);
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bars: QqpBar[] = (raw.bars as any[])
    .map(b => ({ date: String(b.date).slice(0, 10), o: b.o, h: b.h, l: b.l, c: b.c, vol: b.vol }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const d = computeQqpModelLayer(bars, 'D');
  const w = computeQqpModelLayer(aggregateWeeklyMonday(bars), 'W');
  console.log(`=== ${code} (日線 ${bars.length} 棒 ${bars[0]?.date}→${bars[bars.length - 1]?.date}) ===`);
  if (!d) {
    console.log('  D: null');
  } else {
    console.log(`  D 快頂 ${d.fastHighs.length} 快底 ${d.fastLows.length} | 確認頂 ${d.confirmedHighs.length} 確認底 ${d.confirmedLows.length} | 腿 ${d.leg} (拐點 ${d.legPivotDate} @${d.legPivotPrice})`);
    console.log(`  D 快頂首3: ${d.fastHighs.slice(0, 3).map(p => p.date).join(',') || '-'} 尾3: ${d.fastHighs.slice(-3).map(p => p.date).join(',') || '-'}`);
    console.log(`  D 快底首3: ${d.fastLows.slice(0, 3).map(p => p.date).join(',') || '-'} 尾3: ${d.fastLows.slice(-3).map(p => p.date).join(',') || '-'}`);
    console.log(`  D 確認頂首3: ${d.confirmedHighs.slice(0, 3).map(p => p.date).join(',') || '-'} 尾3: ${d.confirmedHighs.slice(-3).map(p => p.date).join(',') || '-'}`);
    console.log(`  D 確認底首3: ${d.confirmedLows.slice(0, 3).map(p => p.date).join(',') || '-'} 尾3: ${d.confirmedLows.slice(-3).map(p => p.date).join(',') || '-'}`);
  }
  if (!w) {
    console.log('  W: null');
  } else {
    console.log(`  W 快頂 ${w.fastHighs.length} 快底 ${w.fastLows.length} | 確認頂 ${w.confirmedHighs.length} 確認底 ${w.confirmedLows.length} | 腿 ${w.leg} (拐點 ${w.legPivotDate} @${w.legPivotPrice})`);
    console.log(`  W 快頂首3: ${w.fastHighs.slice(0, 3).map(p => p.date).join(',') || '-'} 尾3: ${w.fastHighs.slice(-3).map(p => p.date).join(',') || '-'}`);
    console.log(`  W 快底首3: ${w.fastLows.slice(0, 3).map(p => p.date).join(',') || '-'} 尾3: ${w.fastLows.slice(-3).map(p => p.date).join(',') || '-'}`);
  }
}
