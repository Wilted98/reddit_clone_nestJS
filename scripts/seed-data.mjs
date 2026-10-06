export const demoPassword = 'RoorinDemo2026!';

const people = [
  ['alex', 'Building little web projects and asking too many questions.', true],
  ['mara', 'Coffee, ceramics, and a book in every bag.', true],
  ['andrei', 'Weekend hikes and weekday debugging.', false],
  ['ioana', 'Cooking for friends. Still learning to keep basil alive.', true],
  ['selene', 'Collecting good stories and quiet places to read.', true],
  [
    'corvin',
    'Making things from wood, code, and whatever is in the drawer.',
    false,
  ],
  ['nadia', 'Urban walks, film photography, and small discoveries.', true],
  ['radu', 'A home cook with an unreasonable number of notebooks.', false],
  ['leo', 'Frontend developer. Usually listening to a new album.', true],
  ['sophie', 'Here for thoughtful conversations and excellent soup.', false],
  ['elena', 'Books, balcony plants, and getting outside more often.', false],
  [
    'matei',
    'Cycling around town and repairing things before replacing them.',
    false,
  ],
];

// Each discussion has a question, a reply by its author, and another perspective.
const discussions = [
  {
    slug: 'romania',
    name: 'Around Romania',
    description:
      'Local discoveries, weekend plans, and everyday life around Romania.',
    posts: [
      [
        'A quiet Saturday in Brasov, without a packed itinerary',
        'I took the early train, wandered around the old town, and left the afternoon completely open. The nicest part was finding a tiny cafe away from the main square. What is your favorite low-effort day trip?',
        'Sibiu works beautifully for this. I usually pick one museum and spend the rest of the day walking.',
        'That sounds exactly like my kind of plan. Putting Sibiu on the list for next month.',
        'I live nearby and still forget that a day out does not need a spreadsheet. Thanks for the reminder.',
      ],
      [
        'What is one small thing you like about your neighborhood?',
        'For me it is the corner bakery remembering my usual order. Nothing impressive, just a nice start to the morning. Curious about the little details that make a place feel like home.',
        'The library has a shelf where people leave books for each other. I found my favorite read there.',
        'A shared bookshelf is such a good idea. I might ask our building association about one.',
        'Our neighbors keep a bowl of water outside for the dogs on hot days. It always makes me smile.',
      ],
      [
        'Anyone else rediscovering the city on foot?',
        'I started walking the last two bus stops after work. Found a little park and a secondhand bookshop I had passed for years without noticing. It has turned into the best part of my weekday.',
        'Taking a different street each time makes even a familiar route interesting.',
        'Yes! I am trying that tomorrow instead of automatically taking the shortest way.',
        'I do this with my camera once a week. Ordinary streets look completely different when you slow down.',
      ],
      [
        'A thread for your best rainy-weekend plans',
        'The forecast has cancelled our outdoor plans, so we are making a big pot of soup and inviting a couple of friends over. What does a good indoor weekend look like for you?',
        'A board game afternoon where nobody checks the time.',
        'We have a game we still have not opened. This might finally be its weekend.',
        'Repairing a jacket, listening to an album from beginning to end, and making pancakes.',
      ],
    ],
  },
  {
    slug: 'craft',
    name: 'Makers & Curious Minds',
    description:
      'Small projects, imperfect first attempts, and the satisfaction of making something yourself.',
    posts: [
      [
        'Finished my first little shelf. It is not quite square, and I love it.',
        'I spent three evenings measuring, sanding, and discovering that measuring twice really is useful advice. The shelf is finally holding a few plants. What was the first thing you made that actually got used?',
        'A lopsided mug that is still my pencil holder five years later.',
        'That is reassuring. I suspect this shelf will be around for just as long.',
        'A simple stool for the hallway. The finishing took longer than building the whole thing.',
      ],
      [
        'What are you making this month?',
        'I am trying to mend a pair of jeans instead of buying another pair. The stitches are visible, but I am starting to like them. Share a work in progress, especially the messy ones.',
        'A tote bag from an old curtain. The fabric is much nicer than my sewing skills.',
        'Old curtains are an excellent idea. I have a spare one waiting for a purpose.',
        'A small birdhouse with my niece. She is in charge of all color decisions.',
      ],
      [
        'The tools you actually reach for every week',
        'I borrowed a big toolbox for my last project and used about four things from it. For a small apartment setup, what earns its storage space?',
        'A decent ruler, clamps, and a screwdriver with interchangeable bits.',
        'Clamps are definitely moving up my list. Holding everything by hand was not fun.',
        'A seam ripper, sharp scissors, and a little tray so the tiny parts stop disappearing.',
      ],
      [
        'A repair that felt better than a new purchase',
        'Our wobbly dining chair is finally stable again. It took some patience and a new screw, and somehow dinner felt more satisfying afterward. Tell me about a thing you brought back to life.',
        'An old lamp from my grandparents. The shade needed replacing, but the base is beautiful.',
        'Keeping something with a story is the best part of a repair like that.',
        'My favorite backpack had a broken zip. A local repair shop fixed it in one afternoon.',
      ],
    ],
  },
  {
    slug: 'webdev',
    name: 'Web Development',
    description:
      'Learning in public, practical questions, and small wins from building for the web.',
    posts: [
      [
        'The small project that finally made backend testing click',
        'I am building a tiny discussion app and wrote tests for who is allowed to edit a post. Thinking about the unhappy paths made the design much clearer than another tutorial. What helped testing make sense for you?',
        'Testing the same action as two different users was the turning point for me too.',
        'Exactly. The permission checks suddenly felt like a concrete problem instead of boilerplate.',
        'A regression test for a bug I had actually shipped. Seeing it fail first made everything much less abstract.',
      ],
      [
        'A helpful starting point for Nest testing',
        null,
        'The distinction between testing a service and booting a real module helped me organize my specs.',
        'Same here. I now keep a small wiring test alongside the faster mocked tests.',
        'I appreciate examples that include the failure paths instead of only a successful response.',
        'https://docs.nestjs.com/fundamentals/testing',
      ],
      [
        'What do you put in a project README first?',
        'I have started asking a friend to follow my setup instructions from a fresh clone. Apparently "just start the database" is not an instruction. What is the one setup detail you always look for?',
        'The exact environment variables and a sample file. Guessing which values are required is exhausting.',
        'I am adding both, along with a migration command and a demo login.',
        'A stop command. I always end up with one forgotten process holding a port.',
      ],
      [
        'My favorite improvement this week was an empty state',
        'The page used to be blank when there were no posts. Now it has a clear heading and one useful action. It is a tiny change, but the app finally feels intentional. What small refinement are you proud of?',
        'Keeping the width stable when a confirmation dialog opens.',
        'That one is on my list too. Small layout jumps are surprisingly distracting.',
        'Making all the icon buttons work with a keyboard. It uncovered a couple of awkward focus paths.',
      ],
    ],
  },
  {
    slug: 'books',
    name: 'The Reading Corner',
    description:
      'What you are reading, what stayed with you, and books worth passing along.',
    posts: [
      [
        'A book you enjoyed at a completely unexpected time',
        'I picked up a short novel while waiting for a delayed train and ended up finishing it before I got home. I had no reading plan, which probably helped. Have you stumbled into a favorite like that?',
        'A secondhand copy of a travel memoir I bought because I liked the cover.',
        'Sometimes the completely arbitrary choices are the best ones.',
        'A friend left a collection of essays at my place. I read one and immediately asked to borrow the rest.',
      ],
      [
        'Do you keep reading notes, or just let the book happen?',
        'I like remembering a few lines but do not want reading to become homework. Currently I write one sentence after finishing a book. Curious how other people keep track without making it a chore.',
        'I keep a tiny notebook with the title, the date, and one thing I want to remember.',
        'That is about the right level of effort for me. I might steal the date idea.',
        'No notes while reading, but I enjoy talking about a book afterward. The conversation becomes the record.',
      ],
      [
        'A reading spot that makes an ordinary evening better',
        'Mine is an old armchair beside the window, with a lamp that is finally bright enough. No elaborate setup. Where do you read when you really want to settle in?',
        'At the kitchen table once everyone else has gone to bed.',
        'There is something lovely about having a familiar room entirely to yourself.',
        'A bench in the park when the weather cooperates. The walk there is part of it.',
      ],
      [
        'Pass a book along instead of keeping it forever',
        'I gave a friend a book I loved and asked them to pass it on when they were done. It feels nicer than leaving it on a shelf I rarely touch. Do you have any small book-sharing rituals?',
        'We have a bring-one, take-one pile at our monthly dinner.',
        'That is a great excuse to get people together. I am suggesting it for our next dinner.',
        'My sister and I leave little notes in the back cover before swapping books.',
      ],
    ],
  },
  {
    slug: 'cooking',
    name: 'Everyday Cooking',
    description:
      'Weeknight dinners, kitchen experiments, and food made to be shared.',
    posts: [
      [
        'The dinner you make when the fridge looks empty',
        'Tonight became pasta with garlic, lemon, and the last handful of frozen peas. Better than the takeaway I almost ordered. What is your reliable meal from seemingly nothing?',
        'Rice, a fried egg, and whatever vegetables are left in the drawer.',
        'An egg really does rescue so many dinners.',
        'Lentil soup. I keep the basics in the cupboard and it gives me lunch for tomorrow too.',
      ],
      [
        'I finally wrote down my favorite soup instead of guessing every time',
        'The recipe card says "more lemon than you think" and "save some herbs for the end." Not exactly precise, but much better than forgetting what worked last time. What is your most useful cooking note?',
        'Start the onions earlier. Every time I rush them, I notice it at the end.',
        'That belongs on a sign above my stove.',
        'Write down the pan size. It is the detail I forget when a recipe suddenly behaves differently.',
      ],
      [
        'Cooking for friends without spending the whole evening in the kitchen',
        'I love having people over but keep choosing dishes that need attention right when everyone arrives. Next time I want something mostly finished in advance. What is your relaxed dinner-party plan?',
        'A big pot of stew, bread, and a salad that guests can help assemble.',
        'Giving people a small job sounds like a nice way to make the kitchen less lonely.',
        'I do a baked pasta and buy dessert. It is dinner with friends, not an audition.',
      ],
      [
        'What ingredient made your usual lunch more interesting?',
        'I added a spoonful of pickled onions to my very ordinary sandwich and suddenly wanted to make it again tomorrow. Looking for small changes, not an entirely new recipe.',
        "Fresh herbs in almost anything. Even a few leaves make yesterday's leftovers feel different.",
        'My balcony basil finally has a purpose beyond looking hopeful.',
        'A little toasted sesame on a rice bowl. Good texture with almost no extra work.',
      ],
    ],
  },
  {
    slug: 'outdoors',
    name: 'Outside for a While',
    description:
      'Gentle walks, weekend rides, and finding a little more time outside.',
    posts: [
      [
        'A short walk counts, even when it is not an adventure',
        'I had twenty minutes between meetings and walked around the nearest park. No distance goal and no exciting view. It still improved the afternoon. Where is your easy escape from a busy day?',
        'The path beside the river. Ten minutes there feels much longer in a good way.',
        'Having somewhere close by makes it so much easier to actually go.',
        'A quiet loop around the cemetery near my office. Lots of trees and very little traffic.',
      ],
      [
        'What do you always bring on a casual weekend ride?',
        'I am getting back into cycling and trying not to turn packing into a whole project. Water, a snack, and a small repair kit seem like a good start. What has earned a permanent place in your bag?',
        'A light jacket. I have been grateful for it even on days that started warm.',
        'Adding that now. I tend to judge the entire day by the first five minutes.',
        'A little cash for a bakery stop. Technically not equipment, but an essential part of the ride.',
      ],
      [
        'The same trail in a different season',
        'We walked a route we knew well and spent half the time noticing things we had missed in spring. I like that a familiar place can still surprise you. Do you revisit the same spots or always look for somewhere new?',
        'I have a favorite loop I visit every month. The changes are the whole point.',
        'I am starting to understand the appeal of that. Less planning, more noticing.',
        'A mix of both. Familiar routes are lovely when I want to stop thinking about directions.',
      ],
      [
        'A weekend plan with room to change your mind',
        'Our plan is a morning train, a walk, and lunch wherever looks inviting. If it rains, we will find a cafe and call it a different kind of trip. How much of your weekend do you usually plan?',
        'One fixed thing, like the train home. Everything else can be flexible.',
        'A return ticket is probably all the structure we need too.',
        'I plan the route but leave plenty of time. Rushing is what I am trying to get away from.',
      ],
    ],
  },
];

export function buildSeedData(now = new Date()) {
  const ago = (hours) => new Date(now.getTime() - hours * 3600000);
  const users = people.map(([username, bio, avatar], index) => ({
    id: `seed-user-${username}`,
    username,
    email: `${username}@roorin.example`,
    bio,
    avatarUrl: avatar
      ? `https://api.dicebear.com/9.x/notionists/png?seed=${username}&size=96`
      : null,
    createdAt: ago((120 + index) * 24),
  }));
  const communities = [],
    memberships = [],
    posts = [],
    comments = [],
    votes = [];
  for (const [index, group] of discussions.entries()) {
    const members = Array.from(
      { length: 6 },
      (_, member) => users[(index * 2 + member) % users.length],
    );
    const communityId = `seed-community-${group.slug}`;
    communities.push({
      id: communityId,
      slug: group.slug,
      name: group.name,
      description: group.description,
      ownerId: members[0].id,
      createdAt: ago(30 * 24),
    });
    memberships.push(
      ...members.map((user, member) => ({
        userId: user.id,
        communityId,
        role: member === 0 ? 'OWNER' : 'MEMBER',
        joinedAt: ago(20 * 24),
      })),
    );
    for (const [
      position,
      [title, body, first, reply, second, url],
    ] of group.posts.entries()) {
      const author = members[position];
      const id = `seed-post-${group.slug}-${position + 1}`;
      const createdAt = ago([2, 10, 44, 192][position] + index * 3);
      posts.push({
        id,
        communityId,
        authorId: author.id,
        authorUsername: author.username,
        title,
        body,
        url: url ?? null,
        createdAt,
      });
      for (const [part, text] of [first, reply, second].entries()) {
        const writer =
          part === 1
            ? author
            : users[(index * 2 + position + part + 5) % users.length];
        comments.push({
          id: `${id}-comment-${part + 1}`,
          postId: id,
          parentId: part === 1 ? `${id}-comment-1` : null,
          authorId: writer.id,
          authorUsername: writer.username,
          body: text,
          createdAt: new Date(createdAt.getTime() + (part + 1) * 300000),
        });
      }
      const voters = users
        .filter((user) => user.id !== author.id)
        .slice(position % 3, (position % 3) + 8);
      for (const [choice, voter] of voters.entries()) {
        votes.push({
          id: `${id}-vote-${voter.username}`,
          userId: voter.id,
          postId: id,
          value: (choice + index + position) % 7 === 0 ? -1 : 1,
          createdAt: new Date(createdAt.getTime() + 1200000),
        });
      }
    }
  }
  for (const [index, comment] of comments.entries()) {
    for (const voter of users
      .filter((user) => user.id !== comment.authorId)
      .slice(index % 4, (index % 4) + 3)) {
      votes.push({
        id: `${comment.id}-vote-${voter.username}`,
        userId: voter.id,
        commentId: comment.id,
        value: 1,
        createdAt: new Date(comment.createdAt.getTime() + 300000),
      });
    }
  }
  return { users, communities, memberships, posts, comments, votes };
}
