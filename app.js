const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initialzeDB = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server Running");
    });
  } catch (e) {
    console.log(`Error ${e.message}`);
    process.exit(1);
  }
};
initialzeDB();
let authentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "lucifer", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        next();
      }
    });
  }
};

let twitterverification = async (request, response, next) => {
  let { tweetId } = request.params;
  let { payload } = request;
  let { user_id } = payload;
  let query = `select *
   from follower inner join tweet on
      follower.following_user_id=tweet.user_id 
      where tweet.tweet_id=${tweetId} AND follower.follower_user_id=${user_id};`;

  let list = await db.get(query);
  if (list === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

app.post("/register/", async (request, response) => {
  let { username, password, name, gender } = request.body;
  let check = `select * from user where username='${username}';`;
  let list = await db.get(check);
  if (list !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      let hashed = await bcrypt.hash(password, 10);
      let query = `insert into user ( name,username,password, gender ) values 
        ('${name}',"${username}","${hashed}",'${gender}');`;
      await db.run(query);
      response.status(200);
      response.send("User created successfully");
    }
  }
});
app.post("/login/", async (request, response) => {
  let { username, password } = request.body;
  let check = `select * from user where username='${username}';`;
  let list = await db.get(check);
  console.log(list);
  if (list === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let checkpassword = await bcrypt.compare(password, list.password);
    if (checkpassword) {
      let jwtToken = jwt.sign(list, "lucifer");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  let { payload } = request;
  let { user_id, name, username, gender } = payload;
  let query = `select username,tweet,date_time as dateTime 
  from follower inner join tweet on 
  follower.following_user_id=tweet.user_id inner join user on 
  user.user_id=tweet.user_id 
  where follower.follower_user_id=${user_id}
  order by dateTime desc 
  limit 4;`;
  let list = await db.all(query);
  response.send(list);
});
app.get("/user/following/", authentication, async (request, response) => {
  let { payload } = request;
  let { user_id } = payload;
  let query = `select name from user inner join follower on 
    user.user_id=follower.following_user_id 
    where follower.follower_user_id=${user_id};`;
  let list = await db.all(query);
  response.send(list);
});
app.get("/user/followers/", authentication, async (request, response) => {
  let { payload } = request;
  let { user_id } = payload;
  let query = `select name from user inner join follower on 
    user.user_id=follower.follower_user_id
    where follower.following_user_id=${user_id};`;
  let list = await db.all(query);
  response.send(list);
});
app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  let { tweetId } = request.params;
  let { payload } = request;
  let { user_id } = payload;
  let query = `select tweet.tweet as tweet,
  (select count(*) from like where tweet_id=${tweetId}) as likes,
  (select count(*) from reply where tweet_id=${tweetId}) as replies,
  date_time as dateTime
   from follower inner join tweet on
      follower.following_user_id=tweet.user_id 
      where tweet.tweet_id=${tweetId} AND follower.follower_user_id=${user_id};`;
  let list = await db.get(query);
  if (list === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(list);
  }
});
app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  twitterverification,
  async (request, response) => {
    let { tweetId } = request.params;
    let { payload } = request;
    let { user_id } = payload;

    let check = `select username from like 
    inner join user on like.user_id=user.user_id
     where tweet_id=${tweetId};`;
    let res = await db.all(check);
    let ans = res.map((each) => each.username);
    response.send({ likes: ans });
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  twitterverification,
  async (request, response) => {
    let { tweetId } = request.params;
    let { payload } = request;
    let { user_id } = payload;

    let check = `select name,reply from reply 
    inner join user on reply.user_id=user.user_id
     where tweet_id=${tweetId};`;
    let res = await db.all(check);
    response.send({ replies: res });
  }
);
app.get("/user/tweets/", authentication, async (request, response) => {
  let { payload } = request;
  let { user_id } = payload;
  //let user_id = 1;
  let query = `
  select tweet.tweet as tweet,
  count(distinct(like.like_id)) as likes,
  count(distinct(reply.reply_id)) as replies,
  tweet.date_time as dateTime from
  user inner join tweet on user.user_id=tweet.user_id inner join like on 
  like.tweet_id=tweet.tweet_id inner join reply on reply.tweet_id=tweet.tweet_id
  where user.user_id=${user_id}
  group by tweet.tweet_id`;
  let list = await db.all(query);
  response.send(list);
});
app.post("/user/tweets/", authentication, async (request, response) => {
  let { tweet } = request.body;
  let query = `insert into tweet (tweet) values ("${tweet}")`;
  await db.run(query);
  response.send("Created a Tweet");
});
app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  let { tweetId } = request.params;
  let { payload } = request;
  let { user_id } = payload;
  let getquery = `select * from tweet where user_id='${user_id}' and tweet_id=${tweetId};`;
  let tweet = await db.get(getquery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let query = `delete from tweet where tweet_id=${tweetId};`;
    await db.run(query);
    response.send("Tweet Removed");
  }
});
module.exports = app;
