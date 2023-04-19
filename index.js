const cheerio = require('cheerio')
const axios = require('axios').default
const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const cloudinary = require('cloudinary').v2
require('dotenv').config()

async function downloadImage(url, dirManga, dirPerChap) {
    const filename = path.basename(url)
    const filePath = path.join(`./downloads/${dirManga}/${dirPerChap}`, filename)
    const command = `curl -XGET -H "Referer: https://www.nettruyenvt.com/" "https:${url}" --output "${filePath}"`
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error(`Error downloading ${url}: ${err}`)
                reject(err)
            } else {
                console.log(`Downloaded ${url}`)
                resolve(filePath)
            }
        })
    })
}

function generateRandomID() {
    const min = 100000;
    const max = 999999;
    const randomNum = Math.floor(Math.random() * (max - min + 1) + min);
    return randomNum.toString();
}


async function main() {

    cloudinary.config({
        cloud_name: process.env.CLOUD_NAME,
        api_key: process.env.API_KEY,
        api_secret: process.env.API_SECRET
    })
    try {
        const res = await axios.get(
            'https://www.nettruyenvt.com/truyen-tranh/boku-no-kokoro-yabai-yatsu',
            {
                headers: {
                    'User-Agent': 'Thunder Client (https://www.thunderclient.com)'
                }
            }
        )
        const datas = {
            mangaId: "",
            mangaName: "",
            mangaDescription: "",
            mangaAuthor: "",
            mangaAvatar: "",
            mangaPublish: "",
            mangaGenres: "",
            mangaView: 0,
            chaptersManga: []
        }

        const html = res.data
        const $ = cheerio.load(html)
        const manga_id = generateRandomID()
        const chapTags = $('nav ul li.row div.col-xs-5.chapter a')
        const nameManga = $('meta[property="og:title"]').attr('content')
        const imgTitle = $('meta[itemprop="image"]').attr('content')
        const description = $('div.detail-content p').text()
        const genres = $('li.kind.row p.col-xs-8 a').toArray().map(a => $(a).text())
        const author = $('li.author.row p.col-xs-8').text()
        const jsonLdScript = $('script[type="application/ld+json"]');
        const jsonLdData = JSON.parse(jsonLdScript.html());
        const datePublished = jsonLdData.datePublished;

        datas.mangaId = manga_id
        datas.mangaName = nameManga
        datas.mangaDescription = description
        datas.mangaAuthor = author
        datas.mangaAvatar = imgTitle
        datas.mangaPublish = datePublished
        datas.mangaGenres = genres
        if (fs.existsSync(`./downloads/${nameManga}`)) console.log('Thư mục đã tồn tại')
        else {
            fs.mkdirSync(`./downloads/${nameManga}`, (err) => {
                if (err) return console.error(err)
                else return `Đã tạo thư mục${nameManga}`
            })
        }
        const chaps = chapTags.toArray().map(a => {
            return {
                Chapters: {
                    id: $(a).attr('data-id'),
                    name: $(a).text(),
                    img: []
                },
                url: $(a).attr('href')
            }
        })
        for (const chap of chaps) {
            const chapters = {
                id_chapter: "",
                name_chapter: "",
                url_img_chapter: []
            }
            const nameChapter = chap.Chapters.name
            const idChapter = chap.Chapters.id

            chapters.id_chapter = idChapter
            chapters.name_chapter = nameChapter
            datas.chapters_manga.push(chapters)
            const res = await axios.get(chap.url, {
                headers: {
                    'User-Agent': 'Thunder Client (https://www.thunderclient.com)'
                }
            })
            if (res) {
                console.log(`Đang tải ${chap.Chapters.name}`)
                const html = res.data
                const $ = cheerio.load(html)
                const readTags = $('div.reading-detail.box_doc img')
                const dirPerChap = chap.Chapters.name.split(':')[0]
                fs.mkdirSync(`./downloads/${nameManga}/${dirPerChap}`, (err) => {
                    if (err) return console.error(err)
                    else return `Đã tạo thư mục${dirPerChap}`
                })
                const readList = readTags.toArray().map(img => {
                    return $(img).attr('src')
                }
                )
                const imageDownloadPromises = readList.map(async (url) => {
                    return downloadImage(url, nameManga, dirPerChap).then(async filePath => {
                        if (filePath) {
                            const newExtension = '.jpg';
                            const newFilePath = filePath.replace(/\?/g, '_')
                            const oldPath = path.join(newFilePath)
                            if (path.extname(newFilePath) === '.jpg_data=net' || path.extname(filePath) === '.File') {
                                const newPath = path.join(`./downloads/${nameManga}/${dirPerChap}`, `${path.basename(newFilePath, '.jpg_data=net')}${newExtension}`);
                                fs.renameSync(oldPath, newPath);
                                console.log(`Renamed ${oldPath} to ${newPath}`);
                            } else {
                                console.log('jpg')
                            }

                        }
                    })
                })
                await Promise.all(imageDownloadPromises).then(async () => {
                    const files = fs.readdirSync(`./downloads/${nameManga}/${dirPerChap}`);
                    for (const file of files) {
                        const publicId = path.basename(file, path.extname(file));
                        try {
                            const result = await cloudinary.uploader.upload(
                                `./downloads/${nameManga}/${dirPerChap}/${file}`,
                                {
                                    public_id: publicId,
                                    folder: `${nameManga}`
                                });
                            console.log(file)
                            chapters.url_img_chapter.push(result.secure_url)
                            console.log(result.secure_url)
                            const json = JSON.stringify(datas)
                            fs.writeFileSync('single-2.json', json)
                        } catch (error) {
                            console.error(error);
                        }
                    }
                })
            }
        }
        const json = JSON.stringify(datas)
        fs.writeFileSync('data3.json', json)
    } catch (error) {
        console.error(error)
    }
}

main()
