const config = require('./config');

// 对复杂问题生成备选思路并选最优
async function selectBestApproach(userMsg, systemPrompt, history) {
  // 只对较复杂的问题触发（简单问候/短消息跳过）
  if (!userMsg || userMsg.length < 15) return null;
  const isSimple = /^(在吗|你好|hi|hello|谢谢|好的|嗯|哦)$/i
    .test(userMsg.trim());
  if (isSimple) return null;

  try {
    const { streamChat } = require('./ai');
    let result = '';

    await streamChat({
      messages: [
        {
          role: 'system',
          content: `你是 AMY 的前置思考模块。
分析少爷的问题，生成2个不同的回复思路，选出最优的一个。

少爷的偏好：简洁直接、有温度、具体建议、适时质疑而非一味附和。

输出格式（严格JSON）：
{
  "approach_a": "思路A（30字内）",
  "approach_b": "思路B（30字内）",
  "chosen": "a或b",
  "reason": "选择原因（20字内）",
  "should_challenge": true/false,
  "challenge_point": "如果需要质疑，质疑什么（20字内，不需要则null）"
}`,
        },
        ...history.slice(-4).map(h => ({
          role: h.role, content: h.content,
        })),
        { role: 'user', content: userMsg },
      ],
      onDelta: (d) => { result += d; },
      onDone: () => {},
      onError: () => {},
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[Hypothesis] 选择思路${parsed.chosen.toUpperCase()}: ${parsed.reason}`);
    if (parsed.should_challenge) {
      console.log(`[Hypothesis] 建议质疑: ${parsed.challenge_point}`);
    }
    return parsed;
  } catch {
    return null;
  }
}

module.exports = { selectBestApproach };