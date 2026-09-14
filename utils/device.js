import { registerDevice } from '@/api/device.js'

const UID_KEY = 'sister_uid'

/**
 * 获取设备 uid（本地缓存优先，未注册则调云函数注册并缓存）
 * @returns {Promise<string>} uid
 */
export function getUid() {
	const cached = uni.getStorageSync(UID_KEY)
	if (cached) {
		return Promise.resolve(cached)
	}
	return registerDevice().then((uid) => {
		uni.setStorageSync(UID_KEY, uid)
		return uid
	})
}

/** 清除本地 uid（调试用：强制重新注册） */
export function clearUid() {
	uni.removeStorageSync(UID_KEY)
}
