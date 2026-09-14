/**
 * 媒体工具：图片压缩 + 云存储上传（M0 冒烟验证过的链路，供各页面复用）
 */

/** 压缩目标最大宽度（OCR 场景够用，避免移动网络上传超时） */
const MAX_WIDTH = 1600
/** 单批图片上限（M0 实测 4 张总耗时约 10.5s） */
export const MAX_IMAGES = 4

/** 获取图片信息（Promise 包装，失败返回 width:0 保证流程继续） */
function getImageInfo(src) {
	return new Promise((resolve) => {
		uni.getImageInfo({ src, success: resolve, fail: () => resolve({ width: 0 }) })
	})
}

/** 压缩单张：质量 70、限宽 MAX_WIDTH（Promise 包装，失败回退原图） */
function compressImage(src) {
	return new Promise((resolve) => {
		uni.compressImage({
			src,
			quality: 70,
			compressedWidth: MAX_WIDTH,
			success: (res) => resolve(res.tempFilePath),
			fail: () => resolve(src)
		})
	})
}

/**
 * 逐张压缩：宽度超过 MAX_WIDTH 才压
 * @param {string[]} paths 本地临时路径
 * @returns {Promise<string[]>} 压缩后路径（失败项回退原图）
 */
export async function compressImages(paths) {
	const out = []
	for (const src of paths) {
		const info = await getImageInfo(src)
		out.push(info.width > MAX_WIDTH ? await compressImage(src) : src)
	}
	return out
}

/** 从临时路径提取扩展名，默认 jpg */
function getFileExt(path) {
	const match = /\.(\w+)(\?|$)/.exec(path)
	return match ? match[1].toLowerCase() : 'jpg'
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 串行上传全部图片到云存储，单张失败自动重试一次
 * @param {string[]} paths 本地路径
 * @param {string} folder 云存储目录（如 'ocr/question'）
 * @returns {Promise<string[]>} fileID 列表（与 paths 顺序一致）
 */
export async function uploadImages(paths, folder) {
	const fileIds = []
	for (let i = 0; i < paths.length; i++) {
		const cloudPath = `${folder}/${Date.now()}-${i}.${getFileExt(paths[i])}`
		try {
			const res = await uniCloud.uploadFile({ filePath: paths[i], cloudPath })
			fileIds.push(res.fileID)
		} catch (err) {
			console.error('[uploadImages] 上传失败，1.5 秒后重试：', JSON.stringify(err))
			await sleep(1500)
			const retry = await uniCloud.uploadFile({ filePath: paths[i], cloudPath })
			fileIds.push(retry.fileID)
		}
	}
	return fileIds
}
