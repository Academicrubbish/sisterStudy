import { callFn } from '@/utils/request.js'
import { getUid } from '@/utils/device.js'

/** 错题列表（filter: { subject?, status? }） */
export function getQuestionList(page = 1, pageSize = 20, filter = {}) {
	return getUid().then(uid => callFn('getSolveResult', { uid, type: 'question_list', page, pageSize, filter }))
}

/** 错题详情（含解题引导内容） */
export function getQuestionDetail(questionId) {
	return getUid().then(uid => callFn('getSolveResult', { uid, type: 'solution', questionId }))
}

/** 引导路径埋点上报 */
export function reportTrace(questionId, pathTrace) {
	return getUid().then(uid => callFn('saveQuestion', { uid, action: 'trace', questionId, pathTrace }))
}

/** 掌握状态流转：unresolved / resolved */
export function setQuestionStatus(questionId, status) {
	return getUid().then(uid => callFn('saveQuestion', { uid, action: 'set_status', questionId, status }))
}

/** 删除错题（级联解题记录与向量） */
export function deleteQuestion(questionId) {
	return getUid().then(uid => callFn('saveQuestion', { uid, action: 'delete', questionId }))
}

/** 纠错重生成讲解（note：哪里错了，注入重新生成的 prompt），返回新 batchId */
export function regenerateSolution(questionId, note) {
	return getUid().then(uid => callFn('saveQuestion', { uid, action: 'regenerate', questionId, note }))
}
