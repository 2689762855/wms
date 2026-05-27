import type { Category } from '../types';

export interface TreeNode extends Category {
  children: TreeNode[];
}

export function buildTree(list: Category[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];
  for (const item of list) map.set(item.id, { ...item, children: [] });
  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(item);
    } else {
      roots.push(item);
    }
  }
  return roots;
}

export function toCascaderOptions(tree: TreeNode[]): { value: number; label: string; children?: ReturnType<typeof toCascaderOptions> }[] {
  return tree.map(node => ({
    value: node.id,
    label: node.name,
    ...(node.children.length > 0 ? { children: toCascaderOptions(node.children) } : {}),
  }));
}

export function findPath(tree: TreeNode[], targetId: number): number[] | null {
  for (const node of tree) {
    if (node.id === targetId) return [node.id];
    if (node.children.length > 0) {
      const childPath = findPath(node.children, targetId);
      if (childPath) return [node.id, ...childPath];
    }
  }
  return null;
}

export function getCategoryPath(cat: { name: string; parent?: { name: string; parent?: { name: string } } | null } | null | undefined): string {
  if (!cat) return '-';
  if (cat.parent?.parent) return cat.parent.parent.name + ' - ' + cat.parent.name + ' - ' + cat.name;
  if (cat.parent) return cat.parent.name + ' - ' + cat.name;
  return cat.name;
}

/** 从分类的 parentId 链向上遍历，提取第 N 级分类名（1-indexed，从根开始）。需要传入分类查找 Map。 */
export function getCategoryLevelName(
  cat: { name: string; parentId?: number | null } | null | undefined,
  level: number,
  catMap: Map<number, { name: string; parentId?: number | null }>,
): string {
  if (!cat) return '';
  const chain: string[] = [cat.name];
  let id: number | null | undefined = cat.parentId;
  while (id != null) {
    const p = catMap.get(id);
    if (!p) break;
    chain.unshift(p.name);
    id = p.parentId;
  }
  return chain.length >= level ? chain[level - 1] : chain[0];
}
