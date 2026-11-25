// 對話 log 追加／去重（純函數，供 App.addChatMessage 同 mock 測試共用）
// 規則：
// 1. 最新一條同 role＋內容一字不差 → 就地覆蓋（唔新增一條）。
// 2. 新報告係「📊 」→ 覆蓋 log 入面最近一筆同類提示單。
// 舊規則 2 靠「拼圖量化引擎」呢句字眼認卡——但份報告根本冇呢句（只喺
// 舊去重代碼入面出現過），所以撳診斷出過烘焙版報告之後，即日棒返咗、
// 再撳診斷產生即日版，都永遠唔會取代舊報告（問題 1 根因）。
// 其餘一律追加。
import type { ChatMessage} from '../types/quant';

/** 係咪「📊 」報告（零流量診斷產生嗰份）。 */
export function isPromptCard(text: string): boolean {
const t = text.trim();
return t.startsWith('📊 【') && t.includes('最新時空提示單');
}

export function appendChatMessage(
prev: ChatMessage[],
role: ChatMessage['role'],
text: string
): ChatMessage[] {
const trimmed = text.trim();
// 1. 最新一條相同 → 就地覆蓋
if (
prev.length > 0 &&
prev[prev.length - 1].role === role &&
prev[prev.length - 1].text.trim() === trimmed
) {
const updated = [...prev];
updated[updated.length - 1] = {
...updated[updated.length - 1],
text,
timestamp: Date.now()
};
return updated;
}

// 2. 提示單報告 → 覆蓋最近一筆同類提示單（唔翻舊帳堆疊；即日版取代烘焙版）
if (role === 'ai' && isPromptCard(trimmed)) {
for (let i = prev.length - 1; i >= 0; i--) {
if (prev[i].role === 'ai' && isPromptCard(prev[i].text)) {
const updated = [...prev];
updated[i] = {
...updated[i],
text,
timestamp: Date.now()
};
return updated;
}
}
}

return [
...prev,
{
id: `${Date.now()}-${Math.random()}`,
role,
text,
timestamp: Date.now()
}
];
}
