function createNotifier({ webhookUrl, username = 'bakusai-notifier' }) {
  async function sendMessage(content) {
    if (!webhookUrl) {
      console.warn('[notify] WEBHOOK_URL is not set; skipping Discord notification');
      return;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        username,
        content
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Discord webhook failed: ${response.status} ${body}`);
    }
  }

  return {
    async notifyTest({ source, threadUrl }) {
      const lines = [
        '🧪 Discordテスト通知',
        source ? `実行元: ${source}` : null,
        threadUrl ? `THREAD_URL: ${threadUrl}` : null
      ];

      await sendMessage(lines.filter(Boolean).join('\n'));
    },

    async notifyNewPosts({ diffCount, thread, latestResNo, snippets = [] }) {
      const lines = [
        `📨 新着投稿: ${diffCount}件`,
        `スレ: ${thread.title}`,
        latestResNo ? `最新レス: #${latestResNo}` : null,
        `URL: ${thread.url}`
      ];

      if (snippets.length > 0) {
        lines.push(...snippets.map((snippet, index) => `抜粋${index + 1}: ${snippet}`));
      }

      await sendMessage(lines.filter(Boolean).join('\n'));
    },

    async notifyReachedMax({ thread }) {
      await sendMessage(`⚠️ 1000到達: ${thread.title}\nURL: ${thread.url}`);
    },

    async notifyNextThreadCandidate({ thread }) {
      await sendMessage(`🧵 次スレ候補を検知: ${thread.title}\nURL: ${thread.url}`);
    },

    async notifySwitchedThread({ fromThread, toThread }) {
      await sendMessage(
        `✅ 監視対象を切替: ${fromThread.threadNo ?? '?'} → ${toThread.threadNo ?? '?'}\nURL: ${toThread.url}`
      );
    },

    async notifyError({ message, context }) {
      await sendMessage(`❗ エラー: ${message}${context ? `\n詳細: ${context}` : ''}`);
    },

    async notifyBoot({ thread, latestResNo }) {
      await sendMessage(
        `🚀 監視開始: ${thread.title}\n${latestResNo ? `最新レス: #${latestResNo}\n` : ''}URL: ${thread.url}`
      );
    }
  };
}

module.exports = {
  createNotifier
};
