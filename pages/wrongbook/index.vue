<template>
	<view class="page">
		<!-- 状态筛选 -->
		<view class="tabs">
			<text
				v-for="tab in tabs"
				:key="tab.value"
				class="tab"
				:class="{ active: filter.status === tab.value }"
				@click="switchTab(tab.value)"
			>{{ tab.label }}</text>
		</view>

		<view v-if="!list.length && !loading" class="empty">
			<text class="empty-text">{{ emptyText }}</text>
		</view>

		<view v-for="item in list" :key="item.id" class="card" @click="goDetail(item.id)">
			<view class="card-head">
				<text v-if="item.subject" class="chip">{{ item.subject }}</text>
				<text class="status" :class="item.status">{{ statusText(item.status) }}</text>
			</view>
			<text class="digest">{{ item.digest }}</text>
			<view v-if="item.knowledgePoints.length" class="kp-bar">
				<text v-for="(kp, i) in item.knowledgePoints" :key="i" class="chip kp">{{ kp }}</text>
			</view>
		</view>

		<view v-if="hasMore && list.length" class="more" @click="loadMore">
			<text class="more-text">{{ loading ? '加载中…' : '加载更多' }}</text>
		</view>
	</view>
</template>

<script>
import { getQuestionList } from '@/api/question.js'

/** 错题本列表：按掌握状态筛选，分页 20 条/页 */
export default {
	data() {
		return {
			tabs: [
				{ label: '未解决', value: 'unresolved' },
				{ label: '已解决', value: 'resolved' },
				{ label: '全部', value: '' }
			],
			filter: { status: 'unresolved' },
			list: [],
			page: 1,
			hasMore: true,
			loading: false
		}
	},
	computed: {
		emptyText() {
			return this.filter.status === 'unresolved' ? '太棒了，没有未解决的错题' : '暂无错题'
		}
	},
	onShow() {
		this.page = 1
		this.list = []
		this.hasMore = true
		this.load()
	},
	methods: {
		switchTab(status) {
			this.filter.status = status
			this.page = 1
			this.list = []
			this.hasMore = true
			this.load()
		},
		async load() {
			if (this.loading) return
			this.loading = true
			try {
				const data = await getQuestionList(this.page, 20, this.filter)
				this.list = this.page === 1 ? data : this.list.concat(data)
				this.hasMore = data.length >= 20
			} catch (err) {
				uni.showToast({ title: err.message || '加载失败', icon: 'none' })
			} finally {
				this.loading = false
			}
		},
		loadMore() {
			this.page++
			this.load()
		},
		goDetail(id) {
			uni.navigateTo({ url: '/pages/wrongbook/detail?id=' + id })
		},
		statusText(status) {
			return status === 'resolved' ? '已解决 ✓' : '未解决'
		}
	}
}
</script>

<style scoped>
.page {
	padding: 32rpx;
}
.tabs {
	display: flex;
	margin-bottom: 24rpx;
}
.tab {
	font-size: 28rpx;
	color: #666;
	padding: 12rpx 32rpx;
	background: #fff;
	border-radius: 32rpx;
	margin-right: 16rpx;
}
.tab.active {
	background: #4c7dff;
	color: #fff;
}
.empty {
	padding-top: 200rpx;
	text-align: center;
}
.empty-text {
	color: #999;
	font-size: 28rpx;
}
.card {
	background: #fff;
	border-radius: 16rpx;
	padding: 24rpx;
	margin-bottom: 24rpx;
}
.card-head {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 12rpx;
}
.chip {
	font-size: 22rpx;
	background: #e8efff;
	color: #4c7dff;
	border-radius: 8rpx;
	padding: 4rpx 14rpx;
}
.chip.kp {
	background: #fff3e0;
	color: #ef6c00;
}
.status {
	font-size: 22rpx;
	color: #ff7043;
}
.status.resolved {
	color: #34c77b;
}
.digest {
	font-size: 28rpx;
	color: #333;
	display: block;
}
.kp-bar {
	display: flex;
	flex-wrap: wrap;
	margin-top: 16rpx;
}
.more {
	text-align: center;
	padding: 24rpx;
}
.more-text {
	color: #999;
	font-size: 26rpx;
}
</style>
