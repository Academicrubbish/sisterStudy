'use strict'

/**
 * 错题写接口：引导埋点 / 掌握状态流转 / 删除（级联）
 * @param {Object} event { uid, action: 'trace'|'set_status'|'delete', questionId, pathTrace?, status? }
 */
exports.main = async (event, context) => {
	const uid = (event.uid || '').trim()
	const action = event.action || ''
	const questionId = (event.questionId || '').trim()

	if (!uid || !questionId) {
		return { code: -1, message: '缺少参数' }
	}

	const db = uniCloud.database()
	const now = Date.now()

	try {
		// 归属校验
		const res = await db.collection('question').doc(questionId).get()
		const list = (res.result || res).data || []
		const question = list[0]
		if (!question || question.uid !== uid) {
			return { code: -1, message: '错题不存在' }
		}

		if (action === 'trace') {
			// 引导路径埋点：写入该题最新的 solution_log
			const trace = event.pathTrace || {}
			const logRes = await db.collection('solution_log')
				.where({ question_id: questionId })
				.orderBy('create_time', 'desc')
				.limit(1)
				.get()
			const logs = (logRes.result || logRes).data || []
			if (logs.length === 0) {
				return { code: -1, message: '该错题无解题记录' }
			}
			await db.collection('solution_log').doc(logs[0]._id).update({ path_trace: trace })
			return { code: 0, data: {} }
		}

		if (action === 'set_status') {
			const status = event.status || ''
			if (['unresolved', 'resolved'].indexOf(status) === -1) {
				return { code: -1, message: '非法状态：' + status }
			}
			await db.collection('question').doc(questionId).update({
				status: status, update_time: now
			})
			return { code: 0, data: {} }
		}

		if (action === 'delete') {
			await db.collection('question').doc(questionId).remove()
			await db.collection('solution_log').where({ question_id: questionId }).remove()
			await db.collection('embedding')
				.where({ entity_type: 'question', entity_id: questionId })
				.remove()
			return { code: 0, data: {} }
		}

		// 纠错重生成：新建 solution_log（保留历史版本）+ 解题任务（携带纠错备注注入 prompt）
		if (action === 'regenerate') {
			const note = (event.note || '').trim().slice(0, 200)
			const solutionRes = await db.collection('solution_log').add({
				question_id: questionId,
				stage1_hint: '',
				stage2_full: '',
				similar_exercise: '',
				meta: note ? { regenerate_note: note } : {},
				path_trace: null,
				status: 'pending',
				error_msg: '',
				batch_id: '',
				create_time: now,
				complete_time: null,
				uid: uid
			})
			const taskRes = await db.collection('task_queue').add({
				task_type: 'solution',
				ref_id: solutionRes.id,
				payload: {
					content: question.content_md,
					image_file_ids: question.image_file_ids || [],
					question_id: questionId,
					solution_log_id: solutionRes.id,
					uid: uid,
					grade: '初中',
					regenerate_note: note
				},
				status: 'pending',
				claim_token: '',
				retry_count: 0,
				error_msg: '',
				create_time: now,
				update_time: now
			})
			await db.collection('solution_log').doc(solutionRes.id).update({ batch_id: taskRes.id })
			// 重置为未解决
			await db.collection('question').doc(questionId).update({
				status: 'unresolved', update_time: now
			})
			return { code: 0, data: { batchId: taskRes.id } }
		}

		return { code: -1, message: '未知操作：' + action }
	} catch (err) {
		console.error('[saveQuestion] 操作失败：', err.message)
		return { code: -1, message: '操作失败：' + err.message }
	}
}
