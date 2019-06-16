const config = require("../config.json");
const usage = require("./usage.js");
const checks = require("./checks");
const gets = require("./gets");
const post = require("./post");
const discord = require("./discord");
const twitter = require("./twitter");
const users = require("./users");
const log = require("./log");
const QChannel = require("./QChannel");

const getScreenName = word => {
  if (word.startsWith("@")) {
    return word.substring(1);
  }
  const urlPrefix = "twitter.com/";
  if (word.indexOf(urlPrefix) !== -1) {
    const hasParameters = word.indexOf("?");
    return word.substring(
      word.indexOf(urlPrefix) + urlPrefix.length,
      hasParameters === -1 ? word.length : hasParameters
    );
  }
  return word;
};

const tweet = (args, qChannel) => {
  const screenName = getScreenName(args[0]);
  twitter
    .userTimeline({ screen_name: screenName })
    .then(function(tweets, error) {
      if (tweets.error) {
        if (tweets.error === "Not authorized.") {
          post.message(
            qChannel,
            `**I tried getting a tweet from ${screenName} but Twitter tells me that's unauthorized.**\nThis is usually caused by a blocked account.`
          );
        } else {
          post.message(
            qChannel,
            `**${screenName} does exist but something seems wrong with their profile**\nI can't get their timeline... Twitter had this to say:\n${
              tweets.error
            }`
          );
          log("Unknown error on twitter timeline", qChannel);
          log(tweets.error, qChannel);
        }
        return;
      }
      if (tweets.length < 1) {
        post.message(
          qChannel,
          "It doesn't look like " + screenName + " has any tweets... "
        );
        return;
      }
      let tweet = tweets.find(t => twitter.isValid(t));
      if (!tweet) {
        post.message(
          qChannel,
          "**This user doesn't seem to have any valid tweets**\nYou might want to try again, maybe Twitter messed up?"
        );
        log("Invalid tweets from timeline", qChannel);
        log(tweets, qChannel);
        return;
      }
      twitter.formatTweet(tweet, embed => {
        post.embed(qChannel, embed, true);
      });
      log(`Posted latest tweet from ${screenName}`, qChannel);
    })
    .catch(function(response) {
      const err =
        response &&
        response.errors &&
        response.errors.length > 0 &&
        response.errors[0];
      if (!err) {
        log("Exception thrown without error", qChannel);
        log(response, qChannel);
        post.message(
          qChannel,
          `**Something went wrong getting tweets from ${screenName}**\nI'm looking into it, sorry for the trouble!`
        );
        return;
      }
      const { code, message } = err;
      if (code === 34)
        // Not found
        post.message(
          qChannel,
          `**Twitter tells me @${screenName} doesn't exist!**\nMake sure you enter the screen name and not the display name.`
        );
      else {
        post.message(
          qChannel,
          `**There was a problem getting @${screenName}'s latest tweet**\nIt's possible Twitter is temporarily down.\nTwitter had this to say: \`${message}\``
        );
        log(
          `Couldn't get latest tweet from ${screenName}, user input was ${
            args[0]
          }:`,
          qChannel
        );
        log(response, qChannel);
      }
    });
};

const start = (args, qChannel) => {
  let options = users.defaultOptions();
  let screenNames = [];
  for (let arg of args) {
    if (arg.substring(0, 2) == "--") {
      let option = arg.substring(2);
      if (option === "notext") options.text = false;
    } else {
      screenNames.push(getScreenName(arg));
    }
  }
  if (screenNames.length < 1) {
    post.message(qChannel, usage["start"]);
    return;
  }
  twitter
    .userLookup({ screen_name: screenNames.toString() })
    .then(function(data) {
      let redoStream = false;
      const addedObjectName =
        data.length === 1
          ? `${data[0].screen_name}`
          : `${data.length} users: ${data.reduce(
              (acc, { screen_name }, idx) => {
                if (idx === data.length - 1) {
                  return acc.concat(` and ${screen_name}`);
                } else if (idx === 0) {
                  return screen_name;
                }
                return `, ${screen_name}`;
              },
              ""
            )}`;
      data.forEach(({ id_str: userId, screen_name: name }) => {
        if (!redoStream && !users.collection.hasOwnProperty(userId)) {
          redoStream = true;
        }
        gets.add(qChannel, userId, name, options);
      });
      let channelMsg = `**You're now subscribed to ${addedObjectName}!**\nRemember you can stop me at any time with \`${
        config.prefix
      }stop ${
        data.length === 1 ? data[0].screen_name : "<screen_name>"
      }\`.\nIt can take up to 20min to start getting tweets from them, but once it starts, it'll be in real time!`;
      if (screenNames.length !== data.length) {
        channelMsg += `\n\nIt also appears I was unable to find some of the users you specified, make sure you used their screen name!`;
      }
      post.message(qChannel, channelMsg);
      log(`Added ${addedObjectName}`, qChannel);
      // Re-register the stream if we didn't know the user before
      if (redoStream) {
        twitter.createStream();
      }
      users.save();
    })
    .catch(function(error) {
      if (screenNames.length === 1) {
        post.message(
          qChannel,
          `**I can't find a user by the name of ${
            screenNames[0]
          }**\nYou most likely tried using their display name and not their twitter handle.`
        );
      } else {
        post.message(
          qChannel,
          `**I can't find any of those users:** ${screenNames.toString()}\nYou most likely tried using their display names and not their twitter handles.`
        );
      }
      return;
    });
};

const leaveGuild = (args, qChannel) => {
  let guild = null;
  if (args.length >= 1 && checks.isDm(null, qChannel)) {
    guild = discord.getGuild(args[0]);
  } else if (!checks.isDm(null, qChannel)) {
    guild = channel.guild;
  } else {
    post.message(qChannel, "No valid guild ID provided");
    return;
  }
  if (guild == undefined) {
    post.message(qChannel, "I couldn't find guild: " + args[0]);
    return;
  }
  // Leave the guild
  guild
    .leave()
    .then(g => {
      log(`Left the guild ${g.name}`);
      if (checks.isDm(author, qChannel))
        post.message(qChannel, `Left the guild ${g}`);
    })
    .catch(err => {
      log("Could not leave guild", qChannel);
      log(err);
    });
};

const stop = (args, qChannel) => {
  const screenName = getScreenName(args[0]);
  log(`Removed ${screenName}`, qChannel);
  gets.rm(qChannel, screenName);
};

const stopchannel = (args, qChannel) => {
  targetChannel = qChannel.id;
  channelName = qChannel.name;
  if (args.length > 0) {
    targetChannel = args[0];
    channelObj = channel.guild.channels.find(c => c.id === targetChannel);
    if (!channelObj) {
      post.message(
        qChannel,
        `**I couldn't find channel ${targetChannel} in your server.**\nIf you deleted it, I'll leave it by myself whenever I try to post there, don't worry!`
      );
      return;
    }
    channelName = new QChannel(channelObj).name;
  }
  const count = gets.rmChannel(targetChannel);
  log(`Removed all gets from channel ID:${targetChannel}`, qChannel);
  post.message(
    qChannel,
    `**I've unsubscribed you from ${count} users**\nYou should now stop getting any tweets in ${channelName}.`
  );
};

const list = (args, qChannel) => {
  users.list(qChannel);
};

const adminList = (args, qChannel) => {
  if (args.length > 0) {
    users.adminListGuild(qChannel, args[0]);
  } else {
    users.adminList(qChannel);
  }
};

const announce = async args => {
  const message = args.join(" ");
  const qChannels = await users.getUniqueChannels();
  log(`Posting announcement to ${qChannels.length} channels`);
  post.announcement(message, qChannels);
};

module.exports = {
  start: {
    function: start,
    checks: [
      {
        f: checks.isMod,
        badB: `**Not authorized**\nTo subscribe to a twitter account you need to be a moderator or to have the ${
          config.modRole
        } role!`
      }
    ],
    minArgs: 1
  },
  stop: {
    function: stop,
    checks: [
      {
        f: checks.isMod,
        badB:
          "**Not authorized**\nOnly moderators can unsubscribe from a twitter account!"
      }
    ],
    minArgs: 1
  },
  list: {
    function: list,
    checks: [],
    minArgs: 0
  },
  adminlist: {
    function: adminList,
    checks: [
      {
        f: checks.isDm,
        badB: "For user privacy reasons, this command is only allowed in DMs."
      },
      {
        f: checks.isAdmin,
        badB: "Sorry, only my owner can use the adminlist command!"
      }
    ],
    minArgs: 0
  },
  tweet: {
    function: tweet,
    checks: [],
    minArgs: 1
  },
  stopchannel: {
    function: stopchannel,
    checks: [
      {
        f: checks.isMod,
        badB: `You're not authorized to start fetching tweets, you need to be a mod or to have the ${
          config.modRole
        } role!`
      }
    ]
  },
  leaveguild: {
    function: leaveGuild,
    checks: [
      {
        f: checks.isAdmin,
        badB: "Sorry, only my owner can force me off a server"
      }
    ],
    minArgs: 0
  },
  announce: {
    function: announce,
    checks: [
      {
        f: checks.isAdmin,
        badB: "Sorry, only my owner can do announcements!"
      }
    ]
  }
};