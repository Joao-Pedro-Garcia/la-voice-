// Cache LRU simples (usado para resultados de interpretação externa).
export class LRUCache {
  constructor(max = 200) {
    this.max = max;
    this.map = new Map();
  }
  has(k) {
    return this.map.has(k);
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k, v) {
    this.map.delete(k);
    this.map.set(k, v);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
  get size() {
    return this.map.size;
  }
}
