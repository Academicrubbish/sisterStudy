<template>
	<view class="page">
		<view v-if="loading" class="center"><text class="hint">加载中…</text></view>
		<view v-else-if="!data" class="center"><text class="hint">错题不存在</text></view>

		<view v-else>
			<!-- 题目 -->
			<view class="card">
				<text class="card-label">题目</text>
				<md-view :content="data.question.contentMd" />
				<view v-if="imgUrls.length" class="img-bar">
					<image
						v-for="(u, i) in imgUrls"
						:key="i"
						:src="u"
						mode="aspectFill"
						class="origin-img"
						@click="preview(i)"
					/>
				</view>
			</view>

			<!-- 标注 -->
			<view class="meta-bar">
				<text v-if="data.question.subject" class="chip">{{ data.question.subject }}</text>
				<text v-for="(kp, i) in data.question.knowledgePoints" :key="i" class="chip kp">{{ kp }}</text>
				<text v-if="data.meta.root_cause" class="chip cause">易卡点：{{ data.meta.root_cause }}</text>
				<text class="chip debug" @click="showSource = !showSource">{{ showSource ? '隐藏源码' : '显示源码' }}</text>
			</view>

			<!-- 调试：原始 Markdown 源码（长按可复制，用于排查渲染问题） -->
			<view v-if="showSource" class="card source">
				<text class="card-label">题目源码</text>
				<text class="source-text" user-select>{{ data.question.contentMd }}</text>
				<text v-if="data.stage2Full" class="card-label">讲解源码</text>
				<text v-if="data.stage2Full" class="source-text" user-select>{{ data.stage2Full }}</text>
			</view>

			<!-- 完整讲解 -->
			<view v-if="data.stage2Full" class="card">
				<text class="card-label">讲解</text>
				<md-view :content="data.stage2Full" />
			</view>

			<!-- 引导路径回顾 -->
			<view v-if="data.pathTrace" class="card trace">
				<text class="card-label">当时的学习路径</text>
				<text class="trace-line">看到完整解答：{{ data.pathTrace.gave_up_stage === 0 ? '是' : '否（停在思路引导）' }}</text>
				<text class="trace-line">跳过答案门槛：{{ data.pathTrace.skipped_gate ? '是' : '否' }}</text>
				<text class="trace-line">用时：{{ Math.round((data.pathTrace.duration_ms || 0) / 1000) }} 秒</text>
			</view>

			<view class="actions">
				<button
					class="btn primary"
					@click="toggleStatus"
				>{{ data.question.status === 'resolved' ? '重新标记为未解决' : '我已掌握，标记解决' }}</button>
				<button class="btn ghost" @click="similarComing">来一道类似的</button>
			</view>
		</view>
	</view>
</template>

<script>
import MdView from '@/component/md-view/index.vue'
import { getQuestionDetail, setQuestionStatus } from '@/api/question.js'
import { getTempUrls } from '@/utils/media.js'

/** 错题详情：题目+原图+讲解+引导回顾+状态流转（出题入口 M2 开放） */
export default {
	components: { MdView },
	data() {
		return {
			questionId: '',
			data: null,
			imgUrls: [],
			showSource: false,
			loading: true
		}
	},
	onLoad(query) {
		this.questionId = (query && query.id) || ''
		this.load()
	},
	methods: {
		async load() {
			this.loading = true
			try {
				this.data = await getQuestionDetail(this.questionId)
				if (this.data && this.data.question.imageFileIds.length) {
					this.imgUrls = await getTempUrls(this.data.question.imageFileIds)
				}
			} catch (err) {
				uni.showToast({ title: err.message || '加载失败', icon: 'none' })
			} finally {
				this.loading = false
			}
		},
		preview(index) {
			uni.previewImage({ urls: this.imgUrls, current: index })
		},
		async toggleStatus() {
			const next = this.data.question.status === 'resolved' ? 'unresolved' : 'resolved'
			try {
				await setQuestionStatus(this.questionId, next)
				this.data.question.status = next
				uni.showToast({ title: next === 'resolved' ? '已标记掌握 ✓' : '已重新打开', icon: 'none' })
			} catch (err) {
				uni.showToast({ title: err.message || '操作失败', icon: 'none' })
			}
		},
		similarComing() {
			uni.showToast({ title: '出题功能即将上线', icon: 'none' })
		}
	}
}
</script>

<style scoped>
.page {
	padding: 32rpx;
}
.center {
	padding-top: 200rpx;
	text-align: center;
}
.hint {
	color: #999;
	font-size: 28rpx;
}
.card {
	background: #fff;
	border-radius: 16rpx;
	padding: 24rpx;
	margin-bottom: 24rpx;
}
.card-label {
	font-size: 26rpx;
	font-weight: bold;
	color: #4c7dff;
	display: block;
	margin-bottom: 16rpx;
}
.meta-bar {
	display: flex;
	flex-wrap: wrap;
	margin-bottom: 24rpx;
}
.chip {
	font-size: 24rpx;
	background: #e8efff;
	color: #4c7dff;
	border-radius: 8rpx;
	padding: 6rpx 16rpx;
	margin: 0 12rpx 12rpx 0;
}
.chip.kp {
	background: #fff3e0;
	color: #ef6c00;
}
.chip.cause {
	background: #fce4ec;
	color: #d81b60;
}
.chip.debug {
	background: #f0f0f0;
	color: #999;
}
.source {
	background: #fafafa;
}
.source-text {
	font-size: 24rpx;
	color: #666;
	font-family: monospace;
	white-space: pre-wrap;
	word-break: break-all;
	display: block;
	margin-bottom: 16rpx;
}
.img-bar {
	display: flex;
	flex-wrap: wrap;
	margin-top: 16rpx;
}
.origin-img {
	width: 200rpx;
	height: 200rpx;
	border-radius: 12rpx;
	margin: 0 12rpx 12rpx 0;
}
.trace {
	background: #f8f9fb;
}
.trace-line {
	font-size: 26rpx;
	color: #666;
	display: block;
	margin-bottom: 8rpx;
}
.actions {
	display: flex;
	flex-direction: column;
	gap: 16rpx;
	margin-top: 8rpx;
}
.btn {
	font-size: 30rpx;
}
.btn.primary {
	background-color: #4c7dff;
	color: #fff;
}
.btn.ghost {
	background-color: #fff;
	color: #4c7dff;
	border: 2rpx solid #4c7dff;
}
</style>
