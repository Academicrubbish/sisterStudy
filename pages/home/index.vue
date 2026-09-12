<template>
	<view class="page">
		<view class="header">
			<text class="title">sisterStudy · M0 冒烟测试</text>
			<text class="subtitle">选图 → 上传云存储 → processOcr 识别（qwen3.6-flash）</text>
		</view>

		<view class="actions">
			<button class="btn" @click="chooseImages">选择图片（最多 {{ MAX_IMAGES }} 张）</button>
			<button
				class="btn primary"
				:disabled="!filePaths.length || running"
				@click="startOcr"
			>
				{{ running ? '识别中…' : '开始识别（' + filePaths.length + ' 张）' }}
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
			<text class="card-title">识别结果 · 耗时 {{ result.duration }}ms</text>
			<scroll-view scroll-y class="result-box">
				<text class="card-content" user-select>{{ result.content }}</text>
			</scroll-view>
		</view>

		<view class="history">
			<text class="history-title">本次会话记录（{{ history.length }} 次尝试 / {{ successCount }} 成功）</text>
			<view v-for="(h, i) in history" :key="i" class="history-item" @click="viewHistory(h)">
				<text class="history-line">#{{ history.length - i }} · {{ h.time }} · {{ h.imageCount }} 张 · {{ h.ok ? '成功' : '失败' }} · {{ h.duration }}ms</text>
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
			// 展示状态
			result: { content: '', duration: 0 },
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
		/** 从相册选图（压缩模式，平板测试足够） */
		chooseImages() {
			uni.chooseImage({
				count: this.MAX_IMAGES,
				sizeType: ['compressed'],
				sourceType: ['album', 'camera'],
				success: (res) => {
					this.filePaths = res.tempFilePaths.slice(0, this.MAX_IMAGES)
					this.errorText = ''
					this.result = { content: '', duration: 0 }
				}
			})
		},

		/** 移除已选图片 */
		removeImage(index) {
			this.filePaths.splice(index, 1)
		},

		/** 上传单张图片到云存储，返回 fileID */
		uploadImage(filePath, index) {
			const ext = this.getFileExt(filePath)
			return uniCloud.uploadFile({
				filePath,
				cloudPath: `m0-smoke/${Date.now()}-${index}.${ext}`
			}).then(res => res.fileID)
		},

		/** 从临时路径提取扩展名，默认 jpg */
		getFileExt(path) {
			const match = /\.(\w+)(\?|$)/.exec(path)
			return match ? match[1].toLowerCase() : 'jpg'
		},

		/** 上传全部图片并调用 processOcr 识别 */
		async startOcr() {
			this.running = true
			this.errorText = ''
			this.result = { content: '', duration: 0 }
			const start = Date.now()
			try {
				uni.showLoading({ title: '上传图片中…', mask: true })
				const fileIds = []
				for (let i = 0; i < this.filePaths.length; i++) {
					// 串行上传，避免并发限制干扰冒烟判断
					fileIds.push(await this.uploadImage(this.filePaths[i], i))
				}
				uni.hideLoading()
				uni.showLoading({ title: '识别中…', mask: true })

				const res = await uniCloud.callFunction({
					name: 'processOcr',
					data: {
						imageUrls: fileIds,
						source: 'question',
						uid: 'm0-test'
					}
				})
				uni.hideLoading()

				const duration = Date.now() - start
				const payload = res.result || {}
				if (payload.code !== 0) {
					throw new Error(payload.message || '云函数返回异常')
				}
				this.result = { content: payload.data.content, duration }
				this.pushHistory(true, duration)
			} catch (err) {
				uni.hideLoading()
				this.errorText = err.message || '未知错误'
				this.pushHistory(false, Date.now() - start)
			} finally {
				this.running = false
			}
		},

		/** 记录一次尝试 */
		pushHistory(ok, duration) {
			const now = new Date()
			const pad = n => String(n).padStart(2, '0')
			this.history.unshift({
				time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
				imageCount: this.filePaths.length,
				ok,
				duration
			})
		},

		/** 点击历史记录回看结果 */
		viewHistory() {
			uni.showToast({ title: '结果见上方卡片', icon: 'none' })
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
