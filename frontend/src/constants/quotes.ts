/**
 * Agent dialogue quotes for various office situations.
 */

// Short sayings agents display when accepting work from the boss
export const WORK_ACCEPTANCE_QUOTES: string[] = [
  // Enthusiastic
  "On it!",
  "Let's go!",
  "Got it!",
  "Consider it done!",
  "Right away!",
  "I'm on it!",
  "Leave it to me!",
  "Say no more!",
  "You got it!",
  "Absolutely!",
  // Professional
  "Understood.",
  "Will do.",
  "Noted.",
  "Acknowledged.",
  "Affirmative.",
  "Copy that.",
  "Roger that.",
  "Right on.",
  "Certainly.",
  "Of course.",
  // Casual
  "Sure thing!",
  "No problem!",
  "Easy peasy!",
  "Piece of cake!",
  "I got this!",
  "Watch me!",
  "Here I go!",
  "Time to shine!",
  "My specialty!",
  "Born ready!",
  // Motivated
  "Challenge accepted!",
  "Bring it on!",
  "Let's do this!",
  "Game on!",
  "Ready to roll!",
  "Locked and loaded!",
  "Mission accepted!",
  "Full steam ahead!",
  "At your service!",
  "To the desk!",
  // Quirky
  "Ooh, fun!",
  "Finally!",
  "Yes! Love it!",
  "My time to shine!",
  "Perfecto!",
  "Excellent!",
  "Fantastic!",
  "Brilliant!",
  "Splendid!",
  "Marvelous!",
  // Determined
  "I won't let you down!",
  "Trust me on this.",
  "I've got your back!",
  "Count on me!",
  "This is my jam!",
  "Right up my alley!",
  "Made for this!",
  "This is what I do!",
  "Watch and learn!",
  "Stand back!",
  // Tech-themed
  "Compiling thoughts...",
  "Processing...",
  "Executing!",
  "Initializing!",
  "Loading solution...",
  "Crunching numbers!",
  "Analyzing...",
  "Optimizing!",
  "Deploying!",
  "Syncing up!",
  // Short and sweet
  "Yep!",
  "Done!",
  "Sure!",
  "Yes!",
  "K!",
  "Ok!",
  "Aye!",
  "Yup!",
  "Bet!",
  "Word!",
  // Office humor
  "Coffee first!",
  "After snacks!",
  "Overtime it is!",
  "Meeting-free zone!",
  "Inbox zero later!",
  "Deadline? What deadline?",
  "Hold my coffee!",
  "Peak productivity!",
  "Flow state incoming!",
  "Focus mode: ON",
  // Confident
  "Too easy!",
  "Child's play!",
  "Simple!",
  "Trivial!",
  "Quick work!",
  "Lightning speed!",
  "In a flash!",
  "Watch this!",
  "Nailed it!",
  "Crushed it!",
];

/**
 * Get a random work acceptance quote.
 */
export function getRandomWorkAcceptanceQuote(): string {
  return WORK_ACCEPTANCE_QUOTES[
    Math.floor(Math.random() * WORK_ACCEPTANCE_QUOTES.length)
  ];
}

// Short sayings agents display when turning in completed work to the boss
export const WORK_COMPLETION_QUOTES: string[] = [
  // Presenting work
  "Here's the deliverable!",
  "Fresh off the press!",
  "Hot off the keyboard!",
  "Signed, sealed, delivered!",
  "Special delivery!",
  "As requested!",
  "Your order is ready!",
  "Gift wrapped!",
  "Straight from my desk!",
  "Made with care!",
  // Proud of work
  "My finest work!",
  "Pretty proud of this!",
  "Check this out!",
  "Behold!",
  "Ta-da!",
  "Voilà!",
  "Presenting...!",
  "The masterpiece!",
  "My magnum opus!",
  "Peak performance!",
  // Confident completion
  "Nailed it!",
  "Crushed it!",
  "Done and done!",
  "Mission accomplished!",
  "Task complete!",
  "All finished!",
  "Wrapped up!",
  "Buttoned up!",
  "Locked in!",
  "In the bag!",
  // Casual handoff
  "Here ya go!",
  "All yours!",
  "Catch!",
  "Take it away!",
  "Your turn!",
  "Over to you!",
  "Ready for review!",
  "For your approval!",
  "Have at it!",
  "It's all there!",
  // Professional
  "Per your request.",
  "As discussed.",
  "Completed as specified.",
  "Ready for sign-off.",
  "Awaiting feedback.",
  "For your consideration.",
  "Please review.",
  "Submitted.",
  "Delivered.",
  "Finalized.",
  // Enthusiastic
  "This was fun!",
  "Enjoyed this one!",
  "What a journey!",
  "Learned a lot!",
  "Great challenge!",
  "Loved it!",
  "More please!",
  "That was satisfying!",
  "Smooth sailing!",
  "Piece of cake!",
  // Tech-themed
  "Bug-free, I hope!",
  "All tests passing!",
  "Compiled successfully!",
  "Zero errors!",
  "Ship it!",
  "Ready to deploy!",
  "Merge-ready!",
  "Linted and tested!",
  "Code reviewed!",
  "Docs included!",
  // Playful
  "Don't spend it all!",
  "Handle with care!",
  "Fragile: genius inside!",
  "No refunds!",
  "Battery included!",
  "Some assembly required!",
  "Warning: awesome!",
  "Caution: hot stuff!",
  "Mind = blown!",
  "You're welcome!",
  // Relief
  "Finally done!",
  "Phew!",
  "That was intense!",
  "Off my plate!",
  "Weight lifted!",
  "Free at last!",
  "One down!",
  "Inbox -1!",
  "Crossed off!",
  "Checked!",
  // Short and sweet
  "Done!",
  "Finished!",
  "Complete!",
  "Ready!",
  "Here!",
  "Boom!",
  "Bam!",
  "Yes!",
  "Sorted!",
  "Fixed!",
];

/**
 * Get a random work completion quote.
 */
export function getRandomWorkCompletionQuote(): string {
  return WORK_COMPLETION_QUOTES[
    Math.floor(Math.random() * WORK_COMPLETION_QUOTES.length)
  ];
}
