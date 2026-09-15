import { callFn } from '@/utils/request.js'

/** 会话内公式缓存（tex → data URI），避免重复调用云函数 */
const latexCache = new Map()
const CACHE_LIMIT = 300

/**
 * 批量渲染 LaTeX 公式为 SVG data URI（带缓存）
 * @param {string[]} formulas 带 $ / $$ 包裹的公式原文
 * @returns {Promise<(string|null)[]>} 与输入顺序一致，失败项为 null
 */
export async function renderLatexBatch(formulas) {
	const results = new Array(formulas.length).fill(null)
	const needIdx = []
	const needTex = []

	formulas.forEach((f, i) => {
		const cached = latexCache.get(f)
		if (cached) {
			results[i] = cached
		} else {
			needIdx.push(i)
			// 去掉 $ / $$ 包裹，MathJax 吃裸 TeX
			needTex.push(f.replace(/^\$\$/, '').replace(/\$$/, ''))
		}
	})

	if (needTex.length > 0) {
		const uris = await callFn('renderLatex', { texList: needTex })
		needIdx.forEach((origIdx, k) => {
			if (uris[k]) {
				results[origIdx] = uris[k]
				latexCache.set(formulas[origIdx], uris[k])
			}
		})
		// 简单容量控制：超出后清掉最早的一半
		if (latexCache.size > CACHE_LIMIT) {
			const keys = Array.from(latexCache.keys()).slice(0, Math.floor(CACHE_LIMIT / 2))
			keys.forEach(k => latexCache.delete(k))
		}
	}

	return results
}
