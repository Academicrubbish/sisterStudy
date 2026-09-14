import { callFn } from '@/utils/request.js'

/**
 * 设备注册（幂等）
 * @param {string} [uid] 已有 uid 则复用
 * @returns {Promise<string>} uid
 */
export function registerDevice(uid) {
	return callFn('registerDevice', { uid }).then(data => data.uid)
}
