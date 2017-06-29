import { Asset, Library, Version } from './version'
import { MinecraftLocation } from './file_struct'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import { getString } from './string_utils'
export interface VersionMetaList {
    latest: {
        snapshot: string,
        release: string
    },
    versions: VersionMeta[]
}

export interface VersionMeta {
    id: string,
    type: string,
    time: string,
    releaseTime: string,
    url: string
}

export interface VersionDownloader {
    fetchVersionList(callback: (response: VersionMetaList | Error) => void): void
    downloadVersion(version: VersionMeta, minecraft: MinecraftLocation, callback: () => void): void
}
export interface AssetsDownloader {
    downloadLibrary(Library: Library, minecraft: MinecraftLocation, callback: () => void): void
    downloadAsset(asset: Asset, minecraft: MinecraftLocation, callback: () => void): void
}

export class MojangRepository implements VersionDownloader {
    fetchVersionList(callback: (response: VersionMetaList | Error) => void): void {
        //https://launchermeta.mojang.com/mc/game/version_manifest.json
        getString('https://launchermeta.mojang.com/mc/game/version_manifest.json', (r) => {
            if (typeof r === 'string')
                try {
                    callback(JSON.parse(r))
                } catch (e) {
                    callback(e)
                }
            else callback(r)
        })
        let req = https.request({
            hostname: 'launchermeta.mojang.com',
            path: '/mc/game/version_manifest.json',
            method: 'GET'
        }, (res) => {
            let buf = ''
            res.setEncoding('utf-8')
            res.on('data', (s) => buf += s)
            res.on('end', () => {
                try {
                    callback(JSON.parse(buf))
                } catch (e) {
                    callback(e)
                }
            })
        })
        req.on('error', (err) => {
            callback(err)
        })
        req.end()
    }
    downloadVersion(version: VersionMeta, minecraft: MinecraftLocation, callback: (result: Version | Error) => void): void {
        let [root, json, jar] = minecraft.getVersionAll(version.id)
        url.parse(json)
        fs.mkdirSync(root)
        let jsonStream = fs.createWriteStream(json)
        https.get(version.url, (res) => res.pipe(jsonStream))
        jsonStream.on('finish', () => {
            jsonStream.close()
        })
    }
}

export namespace MinecraftRepository {
    // export function defaultVersionList(): Promise<VersionMetaList> {
    //     return new Promise((resolve, reject) => {
    //         https.request({
    //             host: ""
    //         })
    //     });
    // }
}

