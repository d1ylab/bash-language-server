import * as fs from 'fs'
import { basename, join } from 'path'

import * as ArrayUtil from './util/array'
import * as FsUtil from './util/fs'

/**
 * Provides information based on the programs on your PATH
 */
export default class Executables {
  private executables: Set<string>

  private constructor(executables: string[]) {
    this.executables = new Set(executables)
  }

  /**
   * @param path is expected to to be a ':' separated list of paths.
   */
  public static fromPath(path: string): Promise<Executables> {
    const paths = path.split(':')
    const promises = paths.map((x) => findExecutablesInPath(x))
    return Promise.all(promises)
      .then(ArrayUtil.flattenArray)
      .then(ArrayUtil.uniq)
      .then((executables) => new Executables(executables))
  }

  /**
   * Find all programs in your PATH
   */
  public list(): string[] {
    return Array.from(this.executables.values())
  }

  /**
   * Check if the the given {{executable}} exists on the PATH
   */
  public isExecutableOnPATH(executable: string): boolean {
    return this.executables.has(executable)
  }
}

/**
 * Only returns direct children, or the path itself if it's an executable.
 */
async function findExecutablesInPath(path: string): Promise<string[]> {
  path = FsUtil.untildify(path)

  try {
    const pathStats = await fs.promises.lstat(path)

    if (pathStats.isDirectory()) {
      const childrenPaths = await fs.promises.readdir(path)

      const files = []

      for (const childrenPath of childrenPaths) {
        try {
          const stats = await fs.promises.lstat(join(path, childrenPath))
          if (isExecutableFile(stats)) {
            files.push(basename(childrenPath))
          }
        } catch (error) {
          // Ignore error
        }
      }

      return files
    } else if (isExecutableFile(pathStats)) {
      return [basename(path)]
    }
  } catch (error) {
    // Ignore error
  }

  return []
}

function isExecutableFile(stats: fs.Stats): boolean {
  const isExecutable = !!(1 & parseInt((stats.mode & parseInt('777', 8)).toString(8)[0]))
  return stats.isFile() && isExecutable
}
