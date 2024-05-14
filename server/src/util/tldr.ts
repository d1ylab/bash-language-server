import * as fs from 'fs'
import fetch from 'node-fetch'
import * as Zip from 'adm-zip'
import * as path from 'path'

const remoteURL = "https://tldr.sh/assets/tldr.zip"

function mkdirp(path: string) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true })
  }
}

export interface CommandTarget {
  os: string
  language: string
}

export interface Command {
  name: string
  platform: string[]
  language: string[]
  target: CommandTarget[]
}

export class Tldr {

  #commandMap = new Map<string, Command>()
  #commands: string[] = []
  #lang: string = "en"
  #cacheDir: string
  #indexFile: string
  #tmpZipFile: string

  constructor(cacheDir: string,lang = "en") {
    this.#cacheDir = cacheDir
    this.#indexFile = path.join(this.#cacheDir,`index.json`)
    this.#tmpZipFile = path.join(this.#cacheDir, `_tldr.zip`)
    mkdirp(this.#cacheDir)
    if (lang != "en") {
      this.#lang = lang
    }
  }

  updateLang(lang: string) {
    this.#lang = lang
  }

  get #langDir(): string {
    return this.#getLangDir(this.#lang)
  }

  #getLangDir(lang: string): string {
    let prefix = 'pages'
    if (lang != 'en') {
      prefix += `.${ lang }`
    }
    return path.join(this.#cacheDir, prefix)
  }

  commands(): string[] {
    this.#syncCache()
    return this.#commands
  }

  command(name: string): Command | undefined {
    this.#syncCache()
    return this.#commandMap.get(name)
  }

  // TODO: impl cache logic
  man(cmd: string): string {
    const command = this.command(cmd)
    if (!command) return ""
    let lang = null
    if (!command.language.includes(this.#lang)) {
      if (command.language.includes('en')) { // en is default
        lang = 'en'
      } else {
        lang = command.language[0] // first language
      }
    }
    return this.#readManWithCMD(command, lang)
  }

  #readManWithCMD(cmd: Command, lang?: string | null): string {
    const [ platform ] = cmd.platform
    let prefix = this.#langDir
    if (lang) {
      prefix = this.#getLangDir(lang)
    }
    const md = path.join(prefix, platform, `${cmd.name}.md`)
    const content = fs.readFileSync(md).toString()
    return content
  }

  #syncCache() {
    if (this.#commands.length == 0) {
      const raw = fs.readFileSync(this.#indexFile).toString('utf-8')
      const { commands } = JSON.parse(raw) as { commands: Command[] }
      this.#commands = commands.map(c => c.name)
      this.#commandMap = new Map(commands.map(c => [c.name, c]))
    }
  }

  async updateCache(always = false) {
    if (this.#lock) {
      throw new Error("Cache is already updating")
    }
    if (!fs.existsSync(this.#indexFile) || always) {
      this.#lock = true
      try {
        await this.#downloadFile(remoteURL, this.#tmpZipFile)
        // unzip file
        new Zip(this.#tmpZipFile).extractAllTo(this.#cacheDir, true)
      } catch (error) {
        console.error(error)
      } finally {
        this.#lock = false
        fs.unlinkSync(this.#tmpZipFile)
      }
    }
    this.#syncCache()
  }

  #lock = false
  get hasLock() {
    return this.#lock
  }

  // https://stackoverflow.com/a/51302466
  #downloadFile = async function (url: string, path: string) {
    const res = await fetch(url)
    const fileStream = fs.createWriteStream(path)
    return await new Promise((resolve, reject) => {
      res.body.pipe(fileStream)
      res.body.on("error", reject)
      fileStream.on("finish", resolve)
    })
  }

}

// ;(async ()=> {
//   const tldr = new Tldr('zh')
//   console.log("Updating tldr cache...")
//   await tldr.updateCache(false)
//   console.log("Done")
//   const md = tldr.man('gcc')
//   console.log(md)
// })()