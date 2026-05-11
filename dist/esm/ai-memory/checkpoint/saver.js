export class BaseCheckpointSaver {
    async getTuple(config) {
        const checkpoint = await this.loadLatest(config.threadId);
        if (!checkpoint)
            return null;
        return {
            config,
            checkpoint,
            parentConfig: checkpoint.parentId
                ? { ...config, threadId: checkpoint.parentId }
                : undefined,
        };
    }
    put(config, checkpoint) {
        return this.save(config, checkpoint.state, checkpoint.parentId);
    }
}
export function generateCheckpointId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `ckpt_${timestamp}_${random}`;
}
export function generateThreadId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `thrd_${timestamp}_${random}`;
}
//# sourceMappingURL=saver.js.map