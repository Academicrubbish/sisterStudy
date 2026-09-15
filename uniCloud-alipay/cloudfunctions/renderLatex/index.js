'use strict'

const mathjax = require('mathjax-node')

// 初始化 mathjax（模块加载时执行一次，函数实例热置期间复用）
mathjax.start()

/**
 * 渲染单个 TeX 公式为 Base64 SVG data URI
 * 失败返回 null（不抛错，由批量结果聚合表达）
 * @param {string} tex 裸 TeX 公式（不含 $ 包裹）
 * @param {number} timeoutMs 单公式超时
 * @returns {Promise<string|null>}
 */
function typesetOne(tex, timeoutMs) {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(null), timeoutMs)
		mathjax.typeset({
			math: tex,
			format: 'TeX',
			svg: true,
			width: null, // 自动宽度
			linebreaks: false
		}, (data) => {
			clearTimeout(timer)
			if (data.errors && data.errors.length > 0) {
				console.error('[renderLatex] 公式错误：', data.errors.join(','), 'tex:', tex.slice(0, 80))
				resolve(null)
				return
			}
			if (!data.svg) {
				resolve(null)
				return
			}
			resolve('data:image/svg+xml;base64,' + Buffer.from(data.svg).toString('base64'))
		})
	})
}

/**
 * LaTeX 公式批量渲染（迁移自 Toolbox renderLatex，扩展批量输入）
 * @param {Object} event { texList: string[] }（兼容单条 event.tex）
 * @returns {Object} { code, data: (string|null)[] } 与输入顺序一致，单项失败为 null
 */
exports.main = async (event, context) => {
	const list = Array.isArray(event.texList)
		? event.texList
		: (event.tex ? [event.tex] : [])

	if (list.length === 0) {
		return { code: -1, message: 'texList 参数不能为空' }
	}
	if (list.length > 20) {
		return { code: -1, message: '单次最多渲染 20 个公式' }
	}

	// 单公式超时按总量分配，总时长控制在 25 秒内
	const perTimeout = Math.max(5000, Math.floor(25000 / list.length))
	const out = []
	for (const tex of list) {
		const t = String(tex || '').trim()
		out.push(t ? await typesetOne(t, perTimeout) : null)
	}

	return { code: 0, data: out }
}
