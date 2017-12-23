import fs from 'fs'

import UserError from '../utils/user-error'

export default function readFile(path) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) {
        reject(err.code === 'ENOENT' ? new UserError(`file ${path} not found`, err) : err)
      } else {
        resolve(data)
      }
    })
  })
}
