<template>
	<view class="page">
		<view class="header">
			<text class="title">今天也要加油哦</text>
			<text class="date">{{ today }}</text>
		</view>

		<view class="grid">
			<view class="grid-item camera" @click="go('/pages/camera/index?type=question')">
				<text class="grid-icon">📷</text>
				<text class="grid-name">拍题求解</text>
				<text class="grid-desc">不会的题拍一拍</text>
			</view>
			<view class="grid-item note" @click="go('/pages/camera/index?type=note')">
				<text class="grid-icon">📒</text>
				<text class="grid-name">拍笔记</text>
				<text class="grid-desc">手写笔记存起来</text>
			</view>
			<view class="grid-item wrongbook" @click="go('/pages/wrongbook/index')">
				<text class="grid-icon">❌</text>
				<text class="grid-name">错题本</text>
				<text class="grid-desc">错过的题不再错</text>
			</view>
			<view class="grid-item notes" @click="go('/pages/note/index')">
				<text class="grid-icon">📚</text>
				<text class="grid-name">我的笔记</text>
				<text class="grid-desc">随时翻看复习</text>
			</view>
		</view>

		<view class="footer" @click="go('/pages/smoke/index')">
			<text class="footer-text">冒烟测试（开发用）</text>
		</view>
	</view>
</template>

<script>
/** M1 首页：四个功能入口（今日概览卡 M1 后期接入统计数据） */
export default {
	data() {
		return {
			today: ''
		}
	},
	onLoad() {
		const now = new Date()
		const pad = n => String(n).padStart(2, '0')
		this.today = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
	},
	methods: {
		go(url) {
			uni.navigateTo({ url })
		}
	}
}
</script>

<style scoped>
.page {
	padding: 40rpx 32rpx;
}
.header {
	margin-bottom: 48rpx;
}
.title {
	font-size: 48rpx;
	font-weight: bold;
	display: block;
}
.date {
	font-size: 26rpx;
	color: #999;
	margin-top: 8rpx;
	display: block;
}
.grid {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
}
.grid-item {
	width: 334rpx;
	height: 240rpx;
	border-radius: 24rpx;
	padding: 32rpx;
	margin-bottom: 24rpx;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	justify-content: center;
}
.grid-item.camera { background: linear-gradient(135deg, #4c7dff, #6c9cff); }
.grid-item.note { background: linear-gradient(135deg, #34c77b, #5ad68f); }
.grid-item.wrongbook { background: linear-gradient(135deg, #ff7043, #ff8a65); }
.grid-item.notes { background: linear-gradient(135deg, #8e6ef2, #a98cf5); }
.grid-icon {
	font-size: 56rpx;
}
.grid-name {
	font-size: 34rpx;
	font-weight: bold;
	color: #fff;
	margin-top: 16rpx;
}
.grid-desc {
	font-size: 24rpx;
	color: rgba(255, 255, 255, 0.85);
	margin-top: 8rpx;
}
.footer {
	margin-top: 48rpx;
	text-align: center;
}
.footer-text {
	font-size: 24rpx;
	color: #bbb;
}
</style>
