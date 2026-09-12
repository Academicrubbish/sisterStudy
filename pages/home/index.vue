<template>
	<view class="page">
		<view class="header">
			<text class="title">sisterStudy · M0 冒烟测试</text>
			<text class="subtitle">选图 → 压缩 → 上传云存储 → processOcr 识别（qwen3.6-flash）</text>
		</view>

		<view class="actions">
			<button class="btn" :disabled="running" @click="chooseImages">选择图片（最多 {{ MAX_IMAGES }} 张）</button>
			<button
				class="btn primary"
				:disabled="!filePaths.length || running"
				@click="startOcr"
			>
				{{ running ? '处理中…' : '开始识别（' + filePaths.length + ' 张）' }}
			</button>
		</view>

		<view v-if="filePaths.length" class="preview">
			<image
				v-for="(p, i) in filePaths"
				:key="i"
				:src="p"
				mode="aspectFill"
				class="thumb"
				@click="removeImage(i)"
			/>
			<text class="preview-tip">点击缩略图可移除</text>
		</view>

		<view v-if="errorText" class="card error">
			<text class="card-title">失败</text>
			<text class="card-content" user-select>{{ errorText }}</text>
		</view>

		<view v-if="result.content" class="card">
			<text class="card-title">识别结果 · 上传 {{ result.uploadMs }}ms · 识别 {{ result.ocrMs }}ms</text>
			<scroll-view scroll-y class="result-box">
				<text class="card-content" user-select>{{ result.content }}</text>
			</scroll-view>
		</view>

		<view class="history">
			<text class="history-title">本次会话记录（{{ history.length }} 次尝试 / {{ successCount }} 成功）</text>
			<view v-for="(h, i) in history" :key="i" class="history-item">
				<text class="history-line">#{{ history.length - i }} · {{ h.time }} · {{ h.imageCount }} 张 · {{ h.ok ? '成功' : '失败' }} · 上传{{ h.uploadMs }}ms / 识别{{ h.ocrMs }}ms</text>
			</view>
		</view>
	</view>
</template>

<script>
/** M0 冒烟测试页：验证 processOcr 云函数在新空间（支付宝小程序云）的完整链路 */
export default {
	data() {
		return {
			MAX_IMAGES: 4,
			// 采集状态
			filePaths: [],
			running: false,
			// 展示状态（分阶段计时：上传 / 识别）
			result: { content: '', uploadMs: 0, ocrMs: 0 },
			errorText: '',
			// 会话内记录（不落库，人工判定识别质量用）
			history: []
		}
	},
	computed: {
		/** 成功次数 */
		successCount() {
			return this.history.filter(h => h.ok).length
		}
	},
	methods: {
		/** 从相册选图并压缩（OCR 用 1600px 已足够，避免大图在移动网络下上传超时） */
		chooseImages() {
			uni.chooseImage({
				count: this.MAX_IMAGES,
				sizeType: ['compressed'],
				sourceType: ['album', 'camera'],
				success: async (res) => {
					const picked = res.tempFilePaths.slice(0, this.MAX_IMAGES)
					this.filePaths = await this.compressImages(picked)
					this.errorText = ''
					this.result = { content: '', uploadMs: 0, ocrMs: 0 }
				}
			})
		},

		/** 逐张压缩：宽度超过 1600px 才压，压缩失败回退原图 */
		async compressImages(paths) {
			const out = []
			for (const src of paths) {
				const info = await this.getImageInfo(src)
				if (info.width > 1600) {
					out.push(await this.compressImage(src))
				} else {
					out.push(src)
				}
			}
			return out
		},

		/** 获取图片信息（Promise 包装，失败时返回 width:0 保证流程继续） */
		getImageInfo(src) {
			return new Promise((resolve) => {
				uni.getImageInfo({ src, success: resolve, fail: () => resolve({ width: 0 }) })
			})
		},

		/** 压缩单张：质量 70、最长边 1600（Promise 包装，失败回退原图） */
		compressImage(src) {
			return new Promise((resolve) => {
				uni.compressImage({
					src,
					quality: 70,
					compressedWidth: 1600,
					success: (res) => resolve(res.tempFilePath),
					fail: () => resolve(src)
				})
			})
		},

		/** 移除已选图片 */
		removeImage(index) {
			this.filePaths.splice(index, 1)
		},

		/** 上传单张图片到云存储，失败自动重试一次 */
		async uploadImage(filePath, index) {
			const ext = this.getFileExt(filePath)
			const cloudPath = `m0-smoke/${Date.now()}-${index}.${ext}`
			try {
				const res = await uniCloud.uploadFile({ filePath, cloudPath })
				return res.fileID
			} catch (err) {
				console.error('上传失败，1.5 秒后重试：', JSON.stringify(err))
				await this.sleep(1500)
				const retry = await uniCloud.uploadFile({ filePath, cloudPath })
				return retry.fileID
			}
		},

		/** 从临时路径提取扩展名，默认 jpg */
		getFileExt(path) {
			const match = /\.(\w+)(\?|$)/.exec(path)
			return match ? match[1].toLowerCase() : 'jpg'
		},

		sleep(ms) {
			return new Promise((resolve) => setTimeout(resolve, ms))
		},

		/** 上传全部图片并调用 processOcr 识别（分阶段计时，方便定位链路卡点） */
		async startOcr() {
			this.running = true
			this.errorText = ''
			this.result = { content: '', uploadMs: 0, ocrMs: 0 }
			const record = { uploadMs: 0, ocrMs: 0 }
			try {
				uni.showLoading({ title: '上传图片中…', mask: true })
				const uploadStart = Date.now()
				const fileIds = []
				// 串行上传，避免并发限制干扰冒烟判断
				for (let i = 0; i < this.filePaths.length; i++) {
					fileIds.push(await this.uploadImage(this.filePaths[i], i))
				}
				record.uploadMs = Date.now() - uploadStart

				uni.hideLoading()
				uni.showLoading({ title: '识别中…', mask: true })
				const ocrStart = Date.now()
				const res = await uniCloud.callFunction({
					name: 'processOcr',
					data: {
						imageUrls: fileIds,
						source: 'question',
						uid: 'm0-test'
					}
				})
				record.ocrMs = Date.now() - ocrStart
				uni.hideLoading()

				const payload = res.result || {}
				if (payload.code !== 0) {
					throw new Error(payload.message || '云函数返回异常')
				}
				this.result = {
					content: payload.data.content,
					uploadMs: record.uploadMs,
					ocrMs: record.ocrMs
				}
				this.pushHistory(true, record)
			} catch (err) {
				uni.hideLoading()
				// record 中为 0 的阶段即失败发生点（如 uploadMs=0 表示卡在上传）
				this.errorText = this.buildFriendlyError(err.message || '未知错误')
				this.pushHistory(false, record)
			} finally {
				this.running = false
			}
		},

		/** 把常见原始报错翻译成带行动指引的提示 */
		buildFriendlyError(msg) {
			if (msg.indexOf('本地调试服务') > -1) {
				return '云函数请求被路由到 HBuilderX 本地调试服务（平板与电脑不在同一网络）。请在 HBuilderX 取消「连接本地云函数」改用云端运行。原始错误：' + msg
			}
			if (msg.indexOf('uploadFile:fail') > -1) {
				return '图片上传失败（多为移动网络不佳或超时）。原始错误：' + msg
			}
			return msg
		},

		/** 记录一次尝试（含分阶段耗时） */
		pushHistory(ok, record) {
			const now = new Date()
			const pad = n => String(n).padStart(2, '0')
			this.history.unshift({
				time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
				imageCount: this.filePaths.length,
				ok,
				uploadMs: record.uploadMs,
				ocrMs: record.ocrMs
			})
		}
	}
}
</script>

<style scoped>
.page {
	padding: 32rpx;
}
.header {
	margin-bottom: 32rpx;
}
.title {
	font-size: 40rpx;
	font-weight: bold;
	display: block;
}
.subtitle {
	font-size: 26rpx;
	color: #666;
	margin-top: 8rpx;
	display: block;
}
.actions {
	display: flex;
	flex-direction: column;
	gap: 16rpx;
	margin-bottom: 32rpx;
}
.btn {
	font-size: 30rpx;
}
.btn.primary {
	background-color: #4c7dff;
	color: #fff;
}
.preview {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	margin-bottom: 32rpx;
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
.card {
	background-color: #fff;
	border-radius: 16rpx;
	padding: 24rpx;
	margin-bottom: 24rpx;
}
.card.error {
	background-color: #fff2f0;
}
.card-title {
	font-size: 28rpx;
	font-weight: bold;
	display: block;
	margin-bottom: 16rpx;
}
.card-content {
	font-size: 26rpx;
	line-height: 1.6;
	white-space: pre-wrap;
	word-break: break-all;
}
.result-box {
	max-height: 600rpx;
}
.history {
	margin-top: 16rpx;
}
.history-title {
	font-size: 26rpx;
	color: #666;
	display: block;
	margin-bottom: 16rpx;
}
.history-item {
	background-color: #fff;
	border-radius: 12rpx;
	padding: 16rpx 24rpx;
	margin-bottom: 12rpx;
}
.history-line {
	font-size: 26rpx;
	color: #333;
}
</style>
