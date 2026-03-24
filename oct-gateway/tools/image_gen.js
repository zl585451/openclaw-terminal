module.exports = {
  name: 'image_gen',
  definition: {
    type: 'function',
    function: {
      name: 'image_gen',
      description: '使用 AI 生成图片。输入文字描述，输出图片 URL。适用于小红书配图、内容封面、产品展示等创作场景。',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: '图片描述（支持中文），如"一杯咖啡在阳光下，温馨风格，高清"'
          },
          negative_prompt: {
            type: 'string',
            description: '不想要的元素，如"模糊,低质量,水印"'
          },
          size: {
            type: 'string',
            enum: ['1024*1024', '720*1280', '1280*720', '768*1152', '1152*768'],
            description: '图片尺寸，默认 1024*1024（正方形），720*1280 适合手机竖屏'
          },
          style: {
            type: 'string',
            enum: ['<auto>', '<photography>', '<portrait>', '<3d cartoon>', '<anime>', '<oil painting>', '<watercolor>', '<sketch>', '<chinese painting>', '<flat illustration>'],
            description: '风格，默认 auto'
          },
          n: {
            type: 'number',
            description: '生成数量，1-4，默认 1'
          }
        },
        required: ['prompt']
      }
    }
  },
  execute: async ({ prompt, negative_prompt = '', size = '1024*1024', style = '<auto>', n = 1 }) => {
    // 优先从保险箱读取通义万象专用 Key
    // 保险箱引用名支持：wanx_key / image_key / wanx / tongyi_wanx
    let apiKey = null;
    const vault = require('../vault_manager');

    if (vault.isUnlocked()) {
      const candidates = ['wanx_key', 'image_key', 'wanx', 'tongyi_wanx', 'wanx_api_key'];
      for (const ref of candidates) {
        try {
          const val = vault.getItem(ref);
          if (val && typeof val === 'string' && val.trim().startsWith('sk-')) {
            apiKey = val.trim();
            console.log(`[ImageGen] 使用保险箱 Key: ${ref}`);
            break;
          }
        } catch {}
      }
    }

    // 降级到环境变量（备用）
    if (!apiKey) {
      apiKey = process.env.WANX_API_KEY || process.env.DASHSCOPE_IMAGE_KEY || '';
    }

    if (!apiKey) {
      return '❌ 未找到通义万象 API Key。\n请在保险箱里存入，引用名用：wanx_key\n格式：sk-xxxxxxxx（纯字符串）';
    }

    try {
      // 提交任务
      const submitRes = await fetch(
        'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-DashScope-Async': 'enable',
          },
          body: JSON.stringify({
            model: 'wanx-v1',
            input: {
              prompt,
              negative_prompt: negative_prompt || undefined,
            },
            parameters: { style, size, n: Math.min(Math.max(1, n), 4) }
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (!submitRes.ok) {
        const err = await submitRes.text();
        return `❌ 提交失败 (${submitRes.status})：${err.slice(0, 300)}`;
      }

      const submitData = await submitRes.json();
      const taskId = submitData?.output?.task_id;
      if (!taskId) return `❌ 未获取到任务ID：${JSON.stringify(submitData).slice(0, 200)}`;

      console.log(`[ImageGen] 任务已提交 task_id: ${taskId}`);

      // 同步轮询（最多等45秒，每3秒查一次，共15次）
      const pollUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;

      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 3000));

        try {
          const pollRes = await fetch(pollUrl, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(8000),
          });

          const pollData = await pollRes.json();
          const status = pollData?.output?.task_status;
          console.log(`[ImageGen] 轮询 ${i + 1}/15 状态: ${status}`);

          if (status === 'SUCCEEDED') {
            const results = pollData?.output?.results || [];
            if (results.length === 0) return '⚠️ 生成完成但无图片结果';
            const urls = results.map((r, i) => `图片${i + 1}：${r.url}`).join('\n');
            return `✅ 图片生成成功！\n\n${urls}\n\n💡 链接有效期约24小时，请及时保存`;
          }

          if (status === 'FAILED') {
            const msg = pollData?.output?.message || '未知原因';
            return `❌ 生成失败：${msg}`;
          }

          // PENDING 或 RUNNING 继续等待
        } catch (pollErr) {
          console.warn(`[ImageGen] 轮询第${i + 1}次失败:`, pollErr.message);
        }
      }

      return `⏱️ 图片生成超时（45秒），请稍后重试\n任务ID: ${taskId}`;

    } catch (e) {
      return `❌ 工具异常：${e.message}`;
    }
  }
};
