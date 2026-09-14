<template>
	<view class="page">
		<view class="section">
			<text class="label">笔记内容（内容变更后会自动重新标注知识点）</text>
			<textarea
				v-model="content"
				class="content-input"
				:maxlength="8000"
				placeholder="笔记内容"
			/>
		</view>

		<view class="section">
			<text class="label">知识点（逗号分隔，可修正 AI 标注）</text>
			<input v-model="kpText" class="kp-input" placeholder="如：一元一次方程, 移项" />
		</view>

		<button class="btn primary" :disabled="saving || !content.trim()" @click="save">
			{{ saving ? '保存中…' : '保存' }}
		</button>
	</view>
</template>

<script>
import { getNote, saveNote } from '@/api/note.js'

/** 笔记编辑：textarea 修正内容 + 知识点标签编辑（内容变更自动重新标注/向量化） */
export default {
	data() {
		return {
			noteId: '',
			content: '',
			kpText: '',
			saving: false
		}
	},
	onLoad(query) {
		this.noteId = (query && query.id) || ''
		this.load()
	},
	methods: {
		async load() {
			try {
				const note = await getNote(this.noteId)
				if (!note) {
					uni.showToast({ title: '笔记不存在', icon: 'none' })
					setTimeout(() => uni.navigateBack(), 800)
					return
				}
				this.content = note.contentMd
				this.kpText = (note.knowledgePoints || []).join(', ')
			} catch (err) {
				uni.showToast({ title: err.message || '加载失败', icon: 'none' })
			}
		},
		async save() {
			this.saving = true
			try {
				const knowledgePoints = this.kpText
					.split(/[,，]/)
					.map(s => s.trim())
					.filter(Boolean)
				await saveNote('update', this.noteId, { content: this.content, knowledgePoints })
				uni.showToast({ title: '已保存', icon: 'success' })
				setTimeout(() => uni.navigateBack(), 600)
			} catch (err) {
				uni.showToast({ title: err.message || '保存失败', icon: 'none' })
				this.saving = false
			}
		}
	}
}
</script>

<style scoped>
.page {
	padding: 32rpx;
}
.section {
	margin-bottom: 32rpx;
}
.label {
	font-size: 26rpx;
	color: #666;
	display: block;
	margin-bottom: 12rpx;
}
.content-input {
	width: 100%;
	min-height: 500rpx;
	background: #fff;
	border-radius: 16rpx;
	padding: 24rpx;
	font-size: 28rpx;
	box-sizing: border-box;
}
.kp-input {
	width: 100%;
	height: 88rpx;
	background: #fff;
	border-radius: 16rpx;
	padding: 0 24rpx;
	font-size: 28rpx;
	box-sizing: border-box;
}
.btn.primary {
	background-color: #4c7dff;
	color: #fff;
	font-size: 30rpx;
}
</style>
