'use strict'

/**
 * 拍笔记提交：创建 note 记录 + 标注任务，立即返回（异步消费由 processAiTask 完成）
 * @param {Object} event { content, imageFileIds, uid }
 * @returns {Object} { code, data: { noteId, batchId } }
 */
exports.main = async (event, context) => {
	const content = (event.content || '').trim()
	const imageFileIds = event.imageFileIds || []
	const uid = (event.uid || '').trim()

	if (!content) {
		return { code: -1, message: '笔记内容不能为空' }
	}

	const db = uniCloud.database()
	const now = Date.now()

	try {
		// uid 合法性校验（单用户体系，防伪造）
		const userRes = await db.collection('device_user').where({ uid }).limit(1).get()
		if (((userRes.result || userRes).data || []).length === 0) {
			return { code: -1, message: '设备未注册' }
		}

		// 创建笔记（标注字段置空，待 processAiTask 填充）
		const noteRes = await db.collection('note').add({
			content_md: content,
			image_file_ids: imageFileIds,
			subject: '',
			knowledge_points: [],
			summary: '',
			uid: uid,
			create_time: now,
			update_time: now
		})

		// 写入标注任务（batchId 即任务 ID，客户端轮询凭据）
		const taskRes = await db.collection('task_queue').add({
			task_type: 'note_annotate',
			ref_id: noteRes.id,
			payload: {
				content: content,
				note_id: noteRes.id,
				uid: uid
			},
			status: 'pending',
			claim_token: '',
			retry_count: 0,
			error_msg: '',
			create_time: now,
			update_time: now
		})

		return { code: 0, data: { noteId: noteRes.id, batchId: taskRes.id } }
	} catch (err) {
		console.error('[annotateNote] 提交失败：', err.message)
		return { code: -1, message: '提交失败，请稍后重试' }
	}
}
