/**
 * 任务轮询器：3s→5s→8s 退避，超时中止
 */

/** 退避间隔序列（毫秒），用尽后固定用最后一个 */
const INTERVALS = [3000, 5000, 8000]

/**
 * 轮询直到 isDone 返回 true
 * @param {Object} opts
 * @param {Function} opts.fn 每次轮询执行的查询（返回 Promise<result>）
 * @param {Function} opts.isDone (result) => boolean 结果是否已就绪
 * @param {number} [opts.maxWait] 最长等待毫秒数，默认 5 分钟
 * @param {Function} [opts.onTick] 每次结果回调（可用于中间态展示）
 * @returns {Promise<Object>} 最后一次满足 isDone 的结果
 */
export function pollTask(opts) {
	const { fn, isDone, maxWait = 300000, onTick } = opts
	const start = Date.now()
	let tick = 0
	let consecutiveErrors = 0

	return new Promise((resolve, reject) => {
		const run = () => {
			if (Date.now() - start > maxWait) {
				reject(new Error('等待超时，任务仍在处理中，请稍后再查看'))
				return
			}
			fn().then((result) => {
				consecutiveErrors = 0
				if (onTick) onTick(result)
				if (isDone(result)) {
					resolve(result)
					return
				}
				schedule()
			}).catch((err) => {
				consecutiveErrors++
				if (consecutiveErrors >= 3) {
					reject(err)
					return
				}
				schedule()
			})
		}
		const schedule = () => {
			const delay = INTERVALS[Math.min(tick, INTERVALS.length - 1)]
			tick++
			setTimeout(run, delay)
		}
		run()
	})
}
