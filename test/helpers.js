'use strict'

exports.clone = function clone (obj) {
  if (obj instanceof Array) return obj.map(clone)
  if (typeof obj !== 'object') return obj
  const copy = {}
  for (let key in obj) copy[key] = obj[key]
  return copy
}
