import { callFn } from '@/utils/request.js'
import { getUid } from '@/utils/device.js'

/**
 * 提交笔记归档（拍笔记，OCR 修正后）
 * @param {Object} data { content, imageFileIds }
 * @returns {Promise<Object>} { noteId, batchId }
 */
export function submitNote(data) {
	return getUid().then(uid => callFn('annotateNote', { ...data, uid }))
}

/** 笔记详情/轮询 */
export function getNote(noteId) {
	return getUid().then(uid => callFn('getSolveResult', { uid, type: 'note', noteId }))
}

/** 笔记列表 */
export function getNoteList(page = 1, pageSize = 20, filter = {}) {
	return getUid().then(uid => callFn('getSolveResult', { uid, type: 'note_list', page, pageSize, filter }))
}

/** 编辑保存（内容变更会自动重新标注+向量化）/ 删除 */
export function saveNote(action, noteId, extra = {}) {
	return getUid().then(uid => callFn('saveNote', { uid, action, noteId, ...extra }))
}
