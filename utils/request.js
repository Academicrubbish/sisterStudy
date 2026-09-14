/**
 * 统一云函数调用封装
 * 约定：云函数返回 { code, message, data }，code === 0 为成功
 */

/** 把常见原始报错翻译成带行动指引的提示 */
function normalizeError(err) {
	const msg = (err && err.message) || String(err)
	if (msg.indexOf('本地调试服务') > -1) {
		return new Error('云函数请求被路由到 HBuilderX 本地调试服务，请在 HBuilderX 切换为云端运行。原始错误：' + msg)
	}
	if (msg.indexOf('FUNCTION_NOT_FOUND') > -1 || msg.indexOf('不存在') > -1) {
		return new Error('云函数不存在，请确认已上传部署。原始错误：' + msg)
	}
	return new Error(msg)
}

/**
 * 调用云函数并解包结果
 * @param {string} name 云函数名
 * @param {Object} data 参数（自动附加 uid 由调用方决定，本层不注入）
 * @returns {Promise<Object>} 云函数返回的 data 部分，失败抛 Error（message 可直接展示）
 */
export function callFn(name, data = {}) {
	return uniCloud.callFunction({ name, data })
		.then((res) => {
			const payload = res.result || {}
			if (payload.code !== 0) {
				throw new Error(payload.message || '请求失败')
			}
			return payload.data
		})
		.catch((err) => {
			throw normalizeError(err)
		})
}
