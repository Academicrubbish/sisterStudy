<template>
	<view class="page">
		<!-- 等待 AI 生成 -->
		<view v-if="phase === 'waiting'" class="center-block">
			<view class="loading-dot">🤔</view>
			<text class="waiting-text">老师正在准备引导…</text>
			<text class="waiting-sub">通常需要 1-2 分钟，可以想一想这道题</text>
		</view>

		<!-- 非题目内容 -->
		<view v-else-if="phase === 'invalid'" class="center-block">
			<view class="loading-dot">🤷</view>
			<text class="waiting-text">这张图片好像不是一道题目</text>
			<button class="btn primary" @click="backHome">重新拍一张</button>
		</view>

		<!-- 生成失败 -->
		<view v-else-if="phase === 'error'" class="center-block">
			<view class="loading-dot">😢</view>
			<text class="waiting-text">生成失败了</text>
			<text class="waiting-sub">{{ errorMsg || '请稍后在错题本中查看' }}</text>
			<button class="btn" @click="backHome">返回首页</button>
		</view>

		<!-- 第一段：思路引导 -->
		<view v-else-if="phase === 'stage1'" class="content">
			<view v-if="originUrls.length" class="card">
				<text class="card-label">题目原图</text>
				<view class="img-bar">
					<image
						v-for="(u, i) in originUrls"
						:key="i"
						:src="u"
						mode="aspectFill"
						class="origin-img"
						@click="preview(i)"
					/>
				</view>
			</view>
			<view class="meta-bar">
				<text v-if="meta.subject" class="meta-chip">{{ meta.subject }}</text>
				<text v-for="(kp, i) in meta.knowledge_points" :key="i" class="meta-chip kp">{{ kp }}</text>
			</view>
			<view class="card">
				<text class="card-label">先想一想</text>
				<md-view :content="stage1Hint" />
			</view>
			<view class="actions">
				<button class="btn ghost" @click="selfTry">我自己再想想</button>
				<button class="btn primary" @click="phase = 'gate'">还是不会，下一步</button>
			</view>
		</view>

		<!-- 答案门槛 -->
		<view v-else-if="phase === 'gate'" class="content">
			<view class="card">
				<text class="card-label">先写下你的答案</text>
				<textarea
					v-model="gateAnswer"
					class="gate-input"
					maxlength="500"
					placeholder="把你算出来的答案写在这里（写不出来也可以跳过）"
				/>
				<text class="gate-tip">先自己算一遍，对照印象更深哦</text>
			</view>
			<view class="actions">
				<button class="btn ghost" @click="viewStage2(true)">跳过，直接看解答</button>
				<button class="btn primary" :disabled="!gateAnswer.trim()" @click="viewStage2(false)">
					我写好了，看讲解
				</button>
			</view>
		</view>

		<!-- 第二段：完整解答 -->
		<view v-else-if="phase === 'stage2'" class="content">
			<view v-if="gateAnswer.trim()" class="my-answer">
				<text class="card-label">你写的答案</text>
				<text class="my-answer-text" user-select>{{ gateAnswer }}</text>
			</view>
			<view class="card">
				<text class="card-label">完整解答</text>
				<md-view :content="stage2Full" />
			</view>
			<view class="card">
				<view class="similar-head" @click="showSimilar = !showSimilar">
					<text class="card-label">同类练习（{{ showSimilar ? '收起' : '展开' }}）</text>
				</view>
				<md-view v-if="showSimilar" :content="similarExercise" />
			</view>
			<view class="actions">
				<button class="btn primary" @click="finish">学完了</button>
			</view>
		</view>
	</view>
</template>

<script>
import MdView from '@/component/md-view/index.vue'
import { getSolution } from '@/api/solution.js'
import { reportTrace } from '@/api/question.js'
import { pollTask } from '@/utils/poll.js'
import { getTempUrls } from '@/utils/media.js'

/**
 * 解题引导页：轮询 → stage1 思路引导 → 答案门槛 → stage2 完整解答
 * 苏格拉底式两段揭示，路径埋点在离开时上报
 */
export default {
	components: { MdView },
	data() {
		return {
			phase: 'waiting', // waiting / stage1 / gate / stage2 / error / invalid
			batchId: '',
			questionId: '',
			stage1Hint: '',
			stage2Full: '',
			similarExercise: '',
			meta: {},
			errorMsg: '',
			gateAnswer: '',
			showSimilar: false,
			originUrls: [],
			startTime: Date.now(),
			skippedGate: false
		}
	},
	onLoad(query) {
		this.batchId = (query && query.batchId) || ''
		if (!this.batchId) {
			uni.showToast({ title: '缺少批次参数', icon: 'none' })
			setTimeout(() => uni.navigateBack(), 800)
			return
		}
		this.pollResult()
	},
	methods: {
		/** 轮询解题结果 */
		pollResult() {
			pollTask({
				fn: () => getSolution(this.batchId),
				isDone: (data) => !!data && data.status !== 'pending',
				maxWait: 300000,
				onTick: (data) => {
					if (data && data.status === 'error') {
						this.errorMsg = data.errorMsg
					}
				}
			}).then((data) => {
				if (!data) {
					this.phase = 'error'
					return
				}
				if (data.status === 'error') {
					this.phase = 'error'
					this.errorMsg = data.errorMsg
					return
				}
				this.questionId = data.question ? data.question.id : ''
				this.stage1Hint = data.stage1Hint
				this.stage2Full = data.stage2Full
				this.similarExercise = data.similarExercise
				this.meta = data.meta || {}
				this.phase = data.question && data.question.status === 'invalid' ? 'invalid' : 'stage1'
				// 题目原图转临时链接（fileID 在 App 端不能直接渲染）
				if (data.question && data.question.imageFileIds.length) {
					this.originUrls = await getTempUrls(data.question.imageFileIds)
				}
			}).catch(() => {
				this.phase = 'error'
				this.errorMsg = '等待超时，请稍后在错题本中查看'
			})
		},

		/** stage1 退出：自己再想想（未看答案） */
		selfTry() {
			this.reportAndLeave(1)
		},

		/** 过门槛看 stage2 */
		viewStage2(skipped) {
			this.skippedGate = skipped
			this.phase = 'stage2'
		},

		/** 学完离开 */
		finish() {
			this.reportAndLeave(0)
		},

		/**
		 * 上报引导路径埋点并返回
		 * @param {number} gaveUpStage 1=停在思路引导，0=看完完整解答
		 */
		reportAndLeave(gaveUpStage) {
			const trace = {
				gave_up_stage: gaveUpStage,
				skipped_gate: this.skippedGate,
				duration_ms: Date.now() - this.startTime
			}
			if (this.questionId) {
				reportTrace(this.questionId, trace).catch(() => {}).then(() => this.backHome())
			} else {
				this.backHome()
			}
		},

		preview(index) {
			uni.previewImage({ urls: this.originUrls, current: index })
		},

		backHome() {
			uni.switchTab ? uni.reLaunch({ url: '/pages/home/index' }) : uni.reLaunch({ url: '/pages/home/index' })
		}
	}
}
</script>

<style scoped>
.page {
	padding: 32rpx;
	min-height: 100vh;
	box-sizing: border-box;
}
.center-block {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-top: 200rpx;
}
.loading-dot {
	font-size: 96rpx;
}
.waiting-text {
	font-size: 34rpx;
	font-weight: bold;
	margin-top: 32rpx;
}
.waiting-sub {
	font-size: 26rpx;
	color: #999;
	margin-top: 16rpx;
	text-align: center;
}
.meta-bar {
	display: flex;
	flex-wrap: wrap;
	margin-bottom: 24rpx;
}
.meta-chip {
	font-size: 24rpx;
	background: #e8efff;
	color: #4c7dff;
	border-radius: 8rpx;
	padding: 6rpx 16rpx;
	margin: 0 12rpx 12rpx 0;
}
.meta-chip.kp {
	background: #fff3e0;
	color: #ef6c00;
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
.actions {
	display: flex;
	flex-direction: column;
	gap: 16rpx;
	margin-top: 16rpx;
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
.gate-input {
	width: 100%;
	min-height: 160rpx;
	background: #f8f9fb;
	border-radius: 12rpx;
	padding: 24rpx;
	font-size: 30rpx;
	box-sizing: border-box;
}
.gate-tip {
	font-size: 24rpx;
	color: #999;
	margin-top: 12rpx;
	display: block;
}
.my-answer {
	background: #f0f9eb;
	border-radius: 16rpx;
	padding: 24rpx;
	margin-bottom: 24rpx;
}
.img-bar {
	display: flex;
	flex-wrap: wrap;
}
.origin-img {
	width: 200rpx;
	height: 200rpx;
	border-radius: 12rpx;
	margin: 0 12rpx 12rpx 0;
}
.my-answer-text {
	font-size: 30rpx;
	word-break: break-all;
}
.similar-head {
	cursor: pointer;
}
</style>
