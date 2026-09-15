import { callFn } from '@/utils/request.js'

/** 会话内公式缓存（tex → data URI），避免重复调用云函数 */
const latexCache = new Map()
const CACHE_LIMIT = 300
/** 每次云函数调用的公式数（分块并行，降低单次超时风险） */
const CHUNK_SIZE = 6

/**
 * 把公式中的裸中文包进 \text{}（GLM 常把中文混进数学模式导致 MathJax 报错）
 * 已在 \text{} 内的中文会被嵌套包裹，无害
 * @param {string} tex 裸 TeX
 * @returns {string}
 */
function wrapCjkInText(tex) {
	return tex.replace(/([一-鿿　-〿＀-￯]+)/g, (m) => '\\text{' + m + '}')
}

/**
 * 去掉 $ / $$ 包裹，MathJax 吃裸 TeX
 * 注意：贪婪剥掉首尾全部 $（原实现块级公式结尾会残留一个 $ 被渲染进 SVG）
 */
function stripDollars(f) {
	return f.replace(/^\$+/, '').replace(/\$+$/, '')
}

/**
 * 调一次云函数渲染一批裸 TeX
 * @returns {Promise<(string|null)[]>}
 */
async function callChunk(texList) {
	try {
		return await callFn('renderLatex', { texList })
	} catch (e) {
		console.error('[renderLatexBatch] 分块调用失败：', e.message)
		return texList.map(() => null)
	}
}

/**
 * 批量渲染 LaTeX 公式为 SVG data URI（带缓存 + 失败中文重试 + 分块并行）
 * @param {string[]} formulas 带 $ / $$ 包裹的公式原文
 * @returns {Promise<(string|null)[]>} 与输入顺序一致，失败项为 null（降级源码显示）
 */
export async function renderLatexBatch(formulas) {
	const results = new Array(formulas.length).fill(null)
	const needIdx = []
	const needTex = []

	// 缓存命中直接返回
	formulas.forEach((f, i) => {
		const cached = latexCache.get(f)
		if (cached) {
			results[i] = cached
		} else {
			needIdx.push(i)
			needTex.push(stripDollars(f))
		}
	})

	if (needTex.length === 0) return results

	// 分块并行渲染
	const chunks = []
	for (let i = 0; i < needTex.length; i += CHUNK_SIZE) {
		chunks.push(needTex.slice(i, i + CHUNK_SIZE))
	}
	const chunkResults = await Promise.all(chunks.map(callChunk))
	const flat = [].concat(...chunkResults)

	// 失败项：中文包 \text{} 后重试一次（GLM 混中文是最常见失败原因）
	const retryIdx = []
	const retryTex = []
	flat.forEach((uri, k) => {
		if (uri) {
			results[needIdx[k]] = uri
		} else {
			const wrapped = wrapCjkInText(needTex[k])
			if (wrapped !== needTex[k]) {
				retryIdx.push(k)
				retryTex.push(wrapped)
			}
		}
	})
	if (retryTex.length > 0) {
		console.warn('[renderLatexBatch] 重试中文混排公式：', retryTex.length, '个')
		const retryChunks = []
		for (let i = 0; i < retryTex.length; i += CHUNK_SIZE) {
			retryChunks.push(retryTex.slice(i, i + CHUNK_SIZE))
		}
		const retryResults = await Promise.all(retryChunks.map(callChunk))
		const retryFlat = [].concat(...retryResults)
		retryFlat.forEach((uri, k) => {
			if (uri) results[needIdx[retryIdx[k]]] = uri
		})
	}

	// 回填缓存
	needIdx.forEach((origIdx, k) => {
		if (results[origIdx]) latexCache.set(formulas[origIdx], results[origIdx])
	})
	if (latexCache.size > CACHE_LIMIT) {
		const keys = Array.from(latexCache.keys()).slice(0, Math.floor(CACHE_LIMIT / 2))
		keys.forEach(k => latexCache.delete(k))
	}

	// 仍失败的公式打日志，便于定位具体 TeX
	const failed = needIdx.filter((origIdx) => !results[origIdx])
	if (failed.length > 0) {
		failed.forEach((origIdx) => {
			console.warn('[renderLatexBatch] 公式渲染失败：', formulas[origIdx])
		})
	}

	return results
}
