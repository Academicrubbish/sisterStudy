'use strict'

/**
 * 笔记写接口：编辑 / 删除
 * @param {Object} event { uid, action: 'update'|'delete', noteId, content?, knowledgePoints? }
 */
exports.main = async (event, context) => {
	const uid = (event.uid || '').trim()
	const action = event.action || ''
	const noteId = (event.noteId || '').trim()

	if (!uid || !noteId) {
		return { code: -1, message: '缺少参数' }
	}

	const db = uniCloud.database()
	const now = Date.now()

	try {
		// 归属校验
		const res = await db.collection('note').doc(noteId).get()
		const list = (res.result || res).data || []
		const note = list[0]
		if (!note || note.uid !== uid) {
			return { code: -1, message: '笔记不存在' }
		}

		if (action === 'update') {
			const content = (event.content || '').trim()
			if (!content) {
				return { code: -1, message: '笔记内容不能为空' }
			}
			const update = {
				content_md: content,
				knowledge_points: event.knowledgePoints || note.knowledge_points || [],
				update_time: now
			}
			await db.collection('note').doc(noteId).update(update)

			// 内容变更后重新标注 + 重新向量化
			if (content !== note.content_md) {
				await db.collection('embedding')
					.where({ entity_type: 'note', entity_id: noteId })
					.remove()
				await db.collection('task_queue').add({
					task_type: 'note_annotate',
					ref_id: noteId,
					payload: { content: content, note_id: noteId, uid: uid },
					status: 'pending',
					claim_token: '',
					retry_count: 0,
					error_msg: '',
					create_time: now,
					update_time: now
				})
			}
			return { code: 0, data: { noteId: noteId } }
		}

		if (action === 'delete') {
			await db.collection('note').doc(noteId).remove()
			await db.collection('embedding')
				.where({ entity_type: 'note', entity_id: noteId })
				.remove()
			return { code: 0, data: {} }
		}

		return { code: -1, message: '未知操作：' + action }
	} catch (err) {
		console.error('[saveNote] 操作失败：', err.message)
		return { code: -1, message: '操作失败：' + err.message }
	}
}
