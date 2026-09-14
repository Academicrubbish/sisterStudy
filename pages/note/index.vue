<template>
	<view class="page">
		<view v-if="!list.length && !loading" class="empty">
			<text class="empty-text">还没有笔记，去首页拍一篇吧</text>
		</view>

		<view v-for="item in list" :key="item.id" class="card" @click="goDetail(item.id)">
			<view class="card-head">
				<text v-if="item.subject" class="chip">{{ item.subject }}</text>
				<text class="time">{{ formatTime(item.createTime) }}</text>
			</view>
			<text class="summary">{{ item.summary }}</text>
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
import { getNoteList } from '@/api/note.js'

/** 笔记列表：分页 20 条/页 */
export default {
	data() {
		return {
			list: [],
			page: 1,
			hasMore: true,
			loading: false
		}
	},
	onShow() {
		// 编辑/新增返回后刷新
		this.page = 1
		this.list = []
		this.hasMore = true
		this.load()
	},
	methods: {
		async load() {
			if (this.loading) return
			this.loading = true
			try {
				const data = await getNoteList(this.page)
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
			uni.navigateTo({ url: '/pages/note/detail?id=' + id })
		},
		formatTime(ts) {
			if (!ts) return ''
			const d = new Date(ts)
			const pad = n => String(n).padStart(2, '0')
			return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
		}
	}
}
</script>

<style scoped>
.page {
	padding: 32rpx;
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
	margin-right: 8rpx;
	margin-bottom: 8rpx;
}
.time {
	font-size: 22rpx;
	color: #bbb;
}
.summary {
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
