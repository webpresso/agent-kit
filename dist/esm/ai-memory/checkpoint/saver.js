import { shortId } from '#shared-utils/short-id.js';
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
    return `ckpt_${timestamp}_${shortId(8)}`;
}
export function generateThreadId() {
    const timestamp = Date.now().toString(36);
    return `thrd_${timestamp}_${shortId(8)}`;
}
//# sourceMappingURL=saver.js.map