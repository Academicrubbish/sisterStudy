import { callFn } from '@/utils/request.js'
import { getUid } from '@/utils/device.js'

/**
 * 提交解题（拍错题，OCR 修正后）
 * @param {Object} data { content, imageFileIds, ocrLogId, force }
 * @returns {Promise<Object>} { questionId, batchId, duplicate? }
 */
export function submitSolution(data) {
	return getUid().then(uid => callFn('generateSolution', { ...data, uid }))
}

/**
 * 轮询解题结果
 * @param {string} batchId 提交返回的批次 ID
 * @returns {Promise<Object|null>} { status, stage1Hint, stage2Full, ... question }
 */
export function getSolution(batchId) {
	return getUid().then(uid => callFn('getSolveResult', { uid, type: 'solution', batchId }))
}
