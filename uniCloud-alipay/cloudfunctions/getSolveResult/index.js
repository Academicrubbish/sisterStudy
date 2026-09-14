'use strict'

/**
 * 查询接口：解题轮询/详情、笔记轮询/详情、错题列表、笔记列表
 * 全部按 uid 归属校验（记录 uid 不符视为不存在，防越权读）
 * @param {Object} event { uid, type, batchId?, questionId?, noteId?, page?, pageSize?, filter? }
 */
exports.main = async (event, context) => {
	const uid = (event.uid || '').trim()
	const type = event.type || ''
	const page = Math.max(1, parseInt(event.page, 10) || 1)
	const pageSize = Math.min(50, Math.max(1, parseInt(event.pageSize, 10) || 20))

	if (!uid) {
		return { code: -1, message: '缺少 uid' }
	}

	const db = uniCloud.database()
	const _ = db.command

	try {
		switch (type) {
			case 'solution':
				return await querySolution(db, _, event, uid)
			case 'note':
				return await queryNote(db, event, uid)
			case 'question_list':
				return await queryQuestionList(db, _, event, uid, page, pageSize)
			case 'note_list':
				return await queryNoteList(db, _, event, uid, page, pageSize)
			default:
				return { code: -1, message: '未知查询类型：' + type }
		}
	} catch (err) {
		console.error('[getSolveResult] 查询失败：', err.message)
		return { code: -1, message: '查询失败：' + err.message }
	}
}

/** 解题轮询/详情：按 batchId 或 questionId 返回 solution_log + question */
async function querySolution(db, _, event, uid) {
	const where = { uid: uid }
	if (event.batchId) where.batch_id = event.batchId
	if (event.questionId) where.question_id = event.questionId
	if (!event.batchId && !event.questionId) {
		return { code: -1, message: '缺少 batchId 或 questionId' }
	}

	const logRes = await db.collection('solution_log').where(where).orderBy('create_time', 'desc').limit(1).get()
	const logs = (logRes.result || logRes).data || []
	if (logs.length === 0) {
		return { code: 0, data: null }
	}
	const log = logs[0]

	const qRes = await db.collection('question').doc(log.question_id).get()
	const qData = (qRes.result || qRes).data || []
	const question = qData[0] || null

	return {
		code: 0,
		data: {
			status: log.status, // pending / processing 由任务状态映射，见下
			errorMsg: log.error_msg || '',
			stage1Hint: log.stage1_hint || '',
			stage2Full: log.stage2_full || '',
			similarExercise: log.similar_exercise || '',
			meta: log.meta || {},
			pathTrace: log.path_trace || null,
			question: question ? {
				id: question._id,
				contentMd: question.content_md,
				imageFileIds: question.image_file_ids || [],
				subject: question.subject || '',
				knowledgePoints: question.knowledge_points || [],
				status: question.status || 'unresolved'
			} : null
		}
	}
}

/** 笔记轮询/详情：按 noteId 返回 note */
async function queryNote(db, event, uid) {
	if (!event.noteId) {
		return { code: -1, message: '缺少 noteId' }
	}
	const res = await db.collection('note').doc(event.noteId).get()
	const list = (res.result || res).data || []
	const note = list[0]
	if (!note || note.uid !== uid) {
		return { code: 0, data: null }
	}
	return {
		code: 0,
		data: {
			id: note._id,
			contentMd: note.content_md,
			imageFileIds: note.image_file_ids || [],
			subject: note.subject || '',
			knowledgePoints: note.knowledge_points || [],
			summary: note.summary || '',
			createTime: note.create_time,
			updateTime: note.update_time
		}
	}
}

/** 错题列表（排除 invalid） */
async function queryQuestionList(db, _, event, uid, page, pageSize) {
	const filter = event.filter || {}
	const where = { uid: uid, status: _.neq('invalid') }
	if (filter.subject) where.subject = filter.subject
	if (filter.status) where.status = filter.status

	const res = await db.collection('question')
		.where(where)
		.orderBy('create_time', 'desc')
		.skip((page - 1) * pageSize)
		.limit(pageSize)
		.get()
	const list = (res.result || res).data || []
	return {
		code: 0,
		data: list.map(q => ({
			id: q._id,
			digest: (q.content_md || '').replace(/[#*`\n]/g, ' ').slice(0, 60),
			subject: q.subject || '',
			knowledgePoints: q.knowledge_points || [],
			status: q.status || 'unresolved',
			createTime: q.create_time
		}))
	}
}

/** 笔记列表 */
async function queryNoteList(db, _, event, uid, page, pageSize) {
	const filter = event.filter || {}
	const where = { uid: uid }
	if (filter.subject) where.subject = filter.subject

	const res = await db.collection('note')
		.where(where)
		.orderBy('create_time', 'desc')
		.skip((page - 1) * pageSize)
		.limit(pageSize)
		.get()
	const list = (res.result || res).data || []
	return {
		code: 0,
		data: list.map(n => ({
			id: n._id,
			summary: n.summary || (n.content_md || '').replace(/[#*`\n]/g, ' ').slice(0, 60),
			subject: n.subject || '',
			knowledgePoints: n.knowledge_points || [],
			createTime: n.create_time
		}))
	}
}
