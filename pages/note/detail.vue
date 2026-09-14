<template>
	<view class="page">
		<view v-if="loading" class="center"><text class="hint">加载中…</text></view>
		<view v-else-if="!note" class="center"><text class="hint">笔记不存在</text></view>

		<view v-else>
			<view class="meta-bar">
				<text v-if="note.subject" class="chip">{{ note.subject }}</text>
				<text v-for="(kp, i) in note.knowledgePoints" :key="i" class="chip kp">{{ kp }}</text>
			</view>

			<view class="card">
				<md-view :content="note.contentMd" />
			</view>

			<view v-if="note.imageFileIds.length" class="card">
				<text class="card-label">原图</text>
				<view class="img-bar">
					<image
						v-for="(fid, i) in note.imageFileIds"
						:key="i"
						:src="fid"
						mode="aspectFill"
						class="origin-img"
						@click="preview(i)"
					/>
				</view>
			</view>

			<view class="actions">
				<button class="btn ghost" @click="goEdit">编辑</button>
				<button class="btn danger" @click="remove">删除</button>
			</view>
		</view>
	</view>
</template>

<script>
import MdView from '@/component/md-view/index.vue'
import { getNote, saveNote } from '@/api/note.js'

/** 笔记详情：渲染 + 原图对照 + 编辑/删除入口 */
export default {
	components: { MdView },
	data() {
		return {
			noteId: '',
			note: null,
			loading: true
		}
	},
	onLoad(query) {
		this.noteId = (query && query.id) || ''
		this.load()
	},
	methods: {
		async load() {
			this.loading = true
			try {
				this.note = await getNote(this.noteId)
			} finally {
				this.loading = false
			}
		},
		preview(index) {
			uni.previewImage({ urls: this.note.imageFileIds, current: index })
		},
		goEdit() {
			uni.navigateTo({ url: '/pages/note/edit?id=' + this.noteId })
		},
		remove() {
			uni.showModal({
				title: '删除笔记',
				content: '删除后无法恢复，确定吗？',
				confirmColor: '#e53935',
				success: async (res) => {
					if (!res.confirm) return
					try {
						await saveNote('delete', this.noteId)
						uni.showToast({ title: '已删除', icon: 'success' })
						setTimeout(() => uni.navigateBack(), 600)
					} catch (err) {
						uni.showToast({ title: err.message || '删除失败', icon: 'none' })
					}
				}
			})
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
.actions {
	display: flex;
	gap: 16rpx;
	margin-top: 8rpx;
}
.btn {
	flex: 1;
	font-size: 30rpx;
}
.btn.ghost {
	background-color: #fff;
	color: #4c7dff;
	border: 2rpx solid #4c7dff;
}
.btn.danger {
	background-color: #fff;
	color: #e53935;
	border: 2rpx solid #e53935;
}
</style>
