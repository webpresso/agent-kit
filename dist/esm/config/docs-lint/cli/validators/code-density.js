export function detectCodeBlocks(content) {
    const codeBlockPattern = /^```[\s\S]*?^```/gm;
    const matches = Array.from(content.matchAll(codeBlockPattern));
    let codeLines = 0;
    for (const match of matches) {
        codeLines += match[0].split("\n").length;
    }
    return {
        count: matches.length,
        totalLines: content.split("\n").length,
        codeLines,
        percentage: 0,
    };
}
//# sourceMappingURL=code-density.js.map