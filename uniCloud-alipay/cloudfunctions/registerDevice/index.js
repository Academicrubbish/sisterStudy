'use strict'

/**
 * 设备注册（单用户单设备，无登录体系）
 * 幂等：携带已存在的 uid 则复用并刷新活跃时间，否则生成新 uid
 * @param {Object} event { uid?: string }
 * @returns {Object} { code, data: { uid } }
 */
exports.main = async (event, context) => {
	const db = uniCloud.database()
	const uid = (event.uid || '').trim()
	const now = Date.now()

	try {
		if (uid) {
			// 已有 uid：校验存在后复用
			const existRes = await db.collection('device_user').where({ uid }).limit(1).get()
			const exist = (existRes.result || existRes).data || []
			if (exist.length > 0) {
				await db.collection('device_user').doc(exist[0]._id).update({ last_active_time: now })
				return { code: 0, data: { uid } }
			}
		}

		// 生成新 uid（device: 前缀 + 时间戳 + 随机串）
		const newUid = 'device:' + now.toString(36) + Math.random().toString(36).slice(2, 10)
		await db.collection('device_user').add({
			uid: newUid,
			device_info: '',
			last_active_time: now,
			parent_pwd_hash: '', // M1 预留不启用
			create_time: now
		})
		return { code: 0, data: { uid: newUid } }
	} catch (err) {
		console.error('[registerDevice] 注册失败：', err.message)
		return { code: -1, message: '设备注册失败：' + err.message }
	}
}
