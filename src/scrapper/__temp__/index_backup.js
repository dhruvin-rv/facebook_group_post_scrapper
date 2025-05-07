import express from 'express';
import puppeteer from 'puppeteer';
import { v4 } from 'uuid';
import dotenv from 'dotenv';

import axios from 'axios';

dotenv.config();

async function imageUrlToBase64(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
  });
  const base64 = Buffer.from(response.data, 'binary').toString('base64');
  const mimeType = response.headers['content-type'];
  return `data:${mimeType};base64,${base64}`;
}

// async function clearPostsFolder() {
// 	try {
// 		const files = await fs.readdir("./posts");
// 		for (const file of files) {
// 			await fs.unlink(`./posts/${file}`);
// 		}
// 	} catch (err) {
// 		console.error("Error clearing posts folder:", err);
// 	}
// }

// await clearPostsFolder();

const app = express();

app.use(express.json());

let proccessing = false;
let maxPostsAge = Date.now() - 24 * 60 * 60 * 1000;
let posts = {};
let tooOldCount = 0;
let maxPostsFromGroup = 10;
let groupsToProcess = [];
let nextGroup = false;

const browser = await puppeteer.launch({
  // headless: false,
  userDataDir: './userData',
  args: ['--no-sandbox', '--start-maximized'],
  defaultViewport: null,
});

const context = await browser.createBrowserContext();
const page = await context.newPage();

await context.setCookie(
  {
    name: 'c_user',
    value: process.env.c_user,
    domain: '.facebook.com',
  },
  {
    name: 'xs',
    value: process.env.xs,
    domain: '.facebook.com',
  },
);

await page.setViewport({
  width: 0,
  height: 0,
});

function getPath(obj, path) {
  const keys = path.split('.');

  function search(current, i) {
    if (current === undefined || current === null) return undefined;

    // If we're at a match
    if (i === keys.length) return current;

    const key = keys[i];

    if (Array.isArray(current)) {
      for (const item of current) {
        const result = search(item, i);
        if (result !== undefined) return result;
      }
      return undefined;
    }

    if (typeof current === 'object') {
      if (current.hasOwnProperty(key)) {
        const result = search(current[key], i + 1);
        if (result !== undefined) return result;
      }

      // Not directly matched, try every subkey recursively
      for (const k in current) {
        const result = search(current[k], i);
        if (result !== undefined) return result;
      }
    }

    return undefined;
  }

  return search(obj, 0);
}

page.on('response', async (response) => {
  const url = response.url();

  if (url.includes('/api/graphql') && response.request().method() === 'POST') {
    try {
      const responseData = await response.text();
      if ((responseData.match(/\n/g) || []).length > 0) {
        let splits = responseData.split('\n');
        for (let line of splits) {
          if (line.trim() != '') {
            const fileName = v4();
            // await fs.writeFile(`./posts/${fileName}.json`, line);

            let post = {};
            let timestamps = [];
            if (getPath(JSON.parse(line), 'creation_time')) {
              const postTime =
                getPath(JSON.parse(line), 'creation_time') * 1000;
              if (postTime > maxPostsAge) {
                // post.date = new Date(postTime).toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "");
                timestamps.push(postTime);
                tooOldCount = 0;
                console.log('Post time:', new Date(postTime).toISOString());
              } else {
                tooOldCount++;
              }
            }

            if (getPath(JSON.parse(line), 'story.tracking')) {
              try {
                const publishTime =
                  getPath(
                    JSON.parse(getPath(JSON.parse(line), 'story.tracking')),
                    'publish_time',
                  ) * 1000;
                if (publishTime > maxPostsAge) {
                  // post.date2 = new Date(publishTime).toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "");
                  timestamps.push(publishTime);
                  tooOldCount = 0;
                  // console.log("Publish time:", new Date(publishTime).toISOString());
                } else {
                  tooOldCount++;
                }
              } catch (error) {}
            }

            let greaterTimestamp = Math.max(...timestamps);
            // post.timestamps = timestamps;
            post.date = new Date(greaterTimestamp)
              .toLocaleString('en-GB', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })
              .replace(',', '');
            post.timestamp = greaterTimestamp;

            if (getPath(JSON.parse(line), 'story.message.text')) {
              try {
                const text = getPath(JSON.parse(line), 'story.message.text');
                if (text) {
                  post.text = text;
                }
              } catch (error) {}
            }
            if (getPath(JSON.parse(line), 'owning_profile')) {
              try {
                const name = getPath(JSON.parse(line), 'owning_profile');
                if (name) {
                  post.posterName = name.name;
                  post.posterID = name.id;
                }
              } catch (error) {}
            }
            if (getPath(JSON.parse(line), 'prefetch_uris_v2')) {
              try {
                const images = getPath(JSON.parse(line), 'prefetch_uris_v2');
                if (images) {
                  if (images.length > 1) {
                    post.images = images.map((image) => image.uri);
                  }
                }
              } catch (error) {}
            }

            if (getPath(JSON.parse(line), 'metadata.story.url')) {
              try {
                const url = getPath(JSON.parse(line), 'metadata.story.url');
                if (url) {
                  post.url = url;
                  post.groupID = url.split('/')[url.split('/').length - 4];
                  post.postID = url.split('/')[url.split('/').length - 2];
                }
              } catch (error) {}
            }

            post.leadFinderID = fileName;

            if (
              Object.keys(post).length &&
              post.postID &&
              post.groupID &&
              groupsToProcess.includes(post.groupID) &&
              post.timestamp > maxPostsAge
            ) {
              if (!posts[post.groupID]) posts[post.groupID] = {};
              posts[post.groupID][post.postID] = post;

              if (
                Object.values(posts[post.groupID]).filter(
                  (p) => p.groupID == post.groupID,
                ).length >= maxPostsFromGroup
              ) {
                nextGroup = true;
              }
            }
          }
        }
      }
    } catch (error) {
      // console.error("Error processing post response:", error);
    }
  }
});

process.on('SIGINT', async () => {
  await browser.close();
  process.exit();
});

app.listen(3001, () => {
  console.log('Server is running on port 3001');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

app.get('/', (req, res) => {
  res.send('Server Running');
});

app.post('/cookies', async (req, res) => {
  const { c_user, xs } = req.body;
  if (!c_user || !xs) {
    res.status(400).send('No c_user or xs provided');
    return;
  }

  console.log(`cookies set: ${c_user}, ${xs}`);

  process.env.c_user = c_user;
  process.env.xs = xs;
  await context.setCookie(
    {
      name: 'c_user',
      value: c_user,
      domain: '.facebook.com',
    },
    {
      name: 'xs',
      value: xs,
      domain: '.facebook.com',
    },
  );

  res.send('Cookies set');
});

app.post('/getPosts', async (req, res) => {
  await page.goto(`https://www.facebook.com/`);
  try {
    await page.waitForSelector('#pass', { timeout: 1000 });
    proccessing = false;
    return res
      .status(500)
      .send('Facebook disconnected. Please procceed with /cookies');
  } catch (error) {}

  if (proccessing) {
    res.status(429).send('Proccessing In Progress');
    return;
  }

  try {
    proccessing = true;

    // Input validation
    if (!req.body.groups || req.body.groups.length == 0) {
      res.status(400).send('No groups provided');
      return;
    }
    if (!req.body.maxPostsAge) {
      res.status(400).send('No max posts age provided');
      return;
    }
    if (!req.body.maxPostsFromGroup) {
      res.status(400).send('No max posts from group provided');
      return;
    }

    // await clearPostsFolder();

    posts = {};
    tooOldCount = 0;
    nextGroup = false;

    const { groups } = req.body;

    console.log(`Request to search groups: ${groups} initiated`);

    maxPostsAge = Date.now() - req.body.maxPostsAge * 60 * 60 * 1000;
    maxPostsFromGroup = req.body.maxPostsFromGroup;
    groupsToProcess = groups;

    for (const group of groups) {
      nextGroup = false;
      console.log(`Now running on group ${group}`);
      await page.goto(
        `https://www.facebook.com/groups/${group}/?sorting_setting=CHRONOLOGICAL`,
        { waitUntil: 'networkidle2' },
      );

      try {
        await page.waitForSelector('rect ~ circle', { timeout: 1000 });
        posts[group] = { error: 'Group not exists' };
        continue;
      } catch (error) {}

      try {
        await page.waitForSelector('[role="feed"]', { timeout: 1000 });
      } catch (error) {
        posts[group] = { error: 'Not a member of this private group' };
        continue;
      }

      try {
        await page.exposeFunction('noMorePosts', () => {
          nextGroup = true;
        });
      } catch (error) {}

      await new Promise((resolve) => {
        let interval = setInterval(() => {
          page.evaluate(() => {
            window.lastY = window.scrollY;
            window.scrollRetries = 0;
            window.scrollTo(0, document.body.scrollHeight);
            if (window.lastY == window.scrollY) {
              console.log('cant scroll, maybe out of posts, retrying');
              window.scrollRetries = window.scrollRetries + 1;
            } else {
              window.scrollRetries = 0;
            }
            if (window.scrollRetries >= 5) {
              console.log('cant scroll, out of posts');
              window.noMorePosts();
            }
            window.lastY = window.scrollY;
          });
          if (tooOldCount >= 10) {
            clearInterval(interval);
            resolve();
          }
          if (nextGroup) {
            nextGroup = false;
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
      tooOldCount = 0;
    }

    await new Promise(async (resolve) => {
      for (let g of Object.keys(posts)) {
        if (posts[g].error) continue;
        for (let p of Object.keys(posts[g])) {
          if (posts[g][p].images) {
            posts[g][p].images = await Promise.all(
              posts[g][p].images.map(async (i) => await imageUrlToBase64(i)),
            );
          }
        }
      }
      resolve();
    });

    try {
      await page.removeExposedFunction('noMorePosts');
    } catch (error) {}

    await new Promise((resolve) => {
      for (let g of groups) {
        // console.log(g, Object.keys(posts[g]).length, Object.keys(posts[g]));
        if (!posts[g] || !Object.keys(posts[g] || {})?.length) {
          posts[g] = {
            error: `No posts in the group, or no posts from the last ${req.body.maxPostsAge} hours`,
          };
        }
      }
      resolve();
    });

    console.log(posts);
    res.send(posts);
  } catch (error) {
    console.error('Error in getPosts:', error);
    res.send('Internal server error: ' + error);
  } finally {
    proccessing = false; // Always reset the processing flag
  }
});
