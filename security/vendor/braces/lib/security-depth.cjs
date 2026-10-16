'use strict';

// Bound recursive walkers even when callers provide their own AST. Parent and
// previous-node references are intentional AST back-links, so inspect nodes only.
const MAX_DEPTH = 100;

function assertAstDepth(ast) {
  const active = new Set();
  const stack = [{ node: ast, depth: 0, leaving: false }];
  while (stack.length > 0) {
    const frame = stack.pop();
    const node = frame.node;
    if (!node || !Array.isArray(node.nodes)) continue;
    if (frame.leaving) {
      active.delete(node);
      continue;
    }
    if (frame.depth > MAX_DEPTH) {
      throw new SyntaxError('Brace AST nesting exceeds safety limit (100)');
    }
    if (active.has(node)) throw new SyntaxError('Cyclic brace AST is not supported');
    active.add(node);
    stack.push({ node, depth: frame.depth, leaving: true });
    for (let index = node.nodes.length - 1; index >= 0; index--) {
      stack.push({ node: node.nodes[index], depth: frame.depth + 1, leaving: false });
    }
  }
}

assertAstDepth.maxDepth = MAX_DEPTH;
module.exports = assertAstDepth;
