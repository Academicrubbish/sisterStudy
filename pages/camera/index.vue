<template>
	<view class="page">
		<view class="step-bar">
			<text class="step-text">{{ type === 'question' ? '拍错题' : '拍笔记' }} · {{ stepText }}</text>
		</view>

		<!-- 第一步：选图 -->
		<view class="section">
			<button class="btn" :disabled="busy" @click="chooseImages">选择图片（最多 {{ MAX_IMAGES }} 张）</button>
			<view v-if="filePaths.length" class="preview">
				<image
					v-for="(p, i) in filePaths"
					:key="i"
					:src="p"
					mode="aspectFill"
					class="thumb"
					@click="removeImage(i)"
				/>
				<text class="preview-tip">点击缩略图移除</text>
			</view>
			<button
				v-if="filePaths.length"
				class="btn primary"
				:disabled="busy"
				@click="recognize"
			>{{ busy ? '处理中…' : '开始识别' }}</button>
		</view>

		<!-- 第二步：修正 -->
		<view v-if="ocrDone" class="section">
			<text class="section-title">识别结果（请修正错字后提交）</text>
			<textarea
				v-model="content"
				class="content-input"
				:maxlength="8000"
				placeholder="识别内容会显示在这里，可编辑修正"
			/>
			<button class="btn primary" :disabled="busy || !content.trim()" @click="submit">
				{{ busy ? '提交中…' : (type === 'question' ? '提交解题' : '保存笔记') }}
			</button>
		</view>
	</view>
</template>

<script>
import { compressImages, uploadImages, MAX_IMAGES } from '@/utils/media.js'
import { callFn } from '@/utils/request.js'
import { getUid } from '@/utils/device.js'
import { submitSolution } from '@/api/solution.js'
import { submitNote } from '@/api/note.js'

/**
 * 采集页：拍错题 / 拍笔记共用（type 参数区分）
 * 状态流：select → compress → upload → ocr → edit → submit
 */
export default {
	data() {
		return {
			MAX_IMAGES,
			type: 'question', // question | note
			filePaths: [],
			content: '',
			ocrDone: false,
			busy: false,
			busyStage: '',
			ocrLogId: '',
			imageFileIds: []
		}
	},
	computed: {
		/** 步骤提示文案 */
		stepText() {
			if (this.busy) return this.busyText
			if (this.ocrDone) return '检查内容 → 提交'
			if (this.filePaths.length) return '已选图 → 点识别'
			return '选择图片开始'
		},
		busyText() {
			return this.busyStage || '处理中'
		}
	},
	onLoad(query) {
		if (query && query.type === 'note') {
			this.type = 'note'
			uni.setNavigationBarTitle({ title: '拍笔记' })
		} else {
			uni.setNavigationBarTitle({ title: '拍错题' })
		}
	},
	methods: {
		/** 选图并压缩 */
		async chooseImages() {
			uni.chooseImage({
				count: MAX_IMAGES,
				sizeType: ['compressed'],
				sourceType: ['album', 'camera'],
				success: async (res) => {
					this.busy = true
					this.busyStage = '压缩图片中'
					this.filePaths = await compressImages(res.tempFilePaths.slice(0, MAX_IMAGES))
					this.busy = false
				}
			})
		},

		/** 移除已选图片 */
		removeImage(index) {
			this.filePaths.splice(index, 1)
			if (!this.filePaths.length) {
				this.ocrDone = false
				this.content = ''
			}
		},

		/** 上传 + OCR 识别 */
		async recognize() {
			this.busy = true
			try {
				this.busyStage = '上传图片中'
				this.imageFileIds = await uploadImages(this.filePaths, 'ocr/' + this.type)

				this.busyStage = '识别中'
				const uid = await getUid()
				const data = await callFn('processOcr', {
					imageUrls: this.imageFileIds,
					source: this.type,
					uid
				})
				this.content = data.content
				this.ocrLogId = data.logId
				this.ocrDone = true
				uni.pageScrollTo({ selector: '.section-title', duration: 200 })
			} catch (err) {
				uni.showToast({ title: err.message || '识别失败', icon: 'none' })
			} finally {
				this.busy = false
			}
		},

		/** 提交：按类型路由 */
		async submit() {
			this.busy = true
			try {
				if (this.type === 'question') {
					await this.submitQuestion(false)
				} else {
					const data = await submitNote({
						content: this.content,
						imageFileIds: this.imageFileIds
					})
					uni.redirectTo({ url: '/pages/note/detail?id=' + data.noteId })
				}
			} catch (err) {
				uni.showToast({ title: err.message || '提交失败', icon: 'none' })
				this.busy = false
			}
		},

		/**
		 * 拍题提交（含去重弹窗决策）
		 * @param {boolean} force 重复题确认后强制提交
		 */
		async submitQuestion(force) {
			const data = await submitSolution({
				content: this.content,
				imageFileIds: this.imageFileIds,
				ocrLogId: this.ocrLogId,
				force
			})
			if (data.duplicate) {
				// 重拍提示：查看旧题 / 仍要提交
				this.busy = false
				uni.showModal({
					title: '这道题好像拍过',
					content: '相似度 ' + Math.round(data.duplicate.score * 100) + '%，要看之前那道题吗？',
					confirmText: '看旧题',
					cancelText: '仍要提交',
					success: (res) => {
						if (res.confirm) {
							uni.redirectTo({ url: '/pages/wrongbook/detail?id=' + data.duplicate.questionId })
						} else {
							this.busy = true
							this.submitQuestion(true).catch((err) => {
								uni.showToast({ title: err.message || '提交失败', icon: 'none' })
								this.busy = false
							})
						}
					}
				})
				return
			}
			uni.redirectTo({ url: '/pages/solve/index?batchId=' + data.batchId })
		}
	}
}
</script>

<style scoped>
.page {
	padding: 32rpx;
}
.step-bar {
	margin-bottom: 24rpx;
}
.step-text {
	font-size: 26rpx;
	color: #666;
}
.section {
	margin-bottom: 40rpx;
}
.section-title {
	font-size: 28rpx;
	font-weight: bold;
	display: block;
	margin-bottom: 16rpx;
}
.btn {
	font-size: 30rpx;
	margin-bottom: 16rpx;
}
.btn.primary {
	background-color: #4c7dff;
	color: #fff;
}
.preview {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	margin: 16rpx 0;
}
.thumb {
	width: 150rpx;
	height: 150rpx;
	border-radius: 12rpx;
	margin: 0 12rpx 12rpx 0;
}
.preview-tip {
	font-size: 24rpx;
	color: #999;
}
.content-input {
	width: 100%;
	min-height: 400rpx;
	background: #fff;
	border-radius: 16rpx;
	padding: 24rpx;
	font-size: 28rpx;
	box-sizing: border-box;
	margin-bottom: 16rpx;
}
</style>
