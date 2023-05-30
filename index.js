const AWS = require("aws-sdk");
const Alexa = require('ask-sdk-core');
const Util = require('./util.js');
const admin = require("firebase-admin");
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');

const serviceAccount = require("firebase.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: ''
});

let audioUrl = ''
let token = ''
const DB = admin.firestore();
DB.settings({ ignoreUndefinedProperties: true })


const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
                .speak(`Welcome to Story Hub, this feature is currently in development. You can currently tell story hub to list the collections, or tell it to play a collection. `)
                .getResponse();
    }
    
};

const ListCollectionsIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'ListCollections'
    );
  },
  async handle(handlerInput) {
    let speakOutput = '';
    let collectionNames = [];

    try {
      const audioCollectionsRef = DB.collection('audio collections');
      const collectionsSnapshot = await audioCollectionsRef.get();

      if (collectionsSnapshot.size > 0) {
        collectionsSnapshot.forEach(doc => {
          collectionNames.push(doc.id);
        });
        
        speakOutput = `The available collections are: ${collectionNames.join(', ')}. Please select a collection to hear about.`;
        handlerInput.attributesManager.setSessionAttributes({ collectionNames });
      } else {
        speakOutput = 'There are no collections available.';
      }
    } catch (error) {
      console.error(`Error retrieving data from Firestore: ${error}`);
      speakOutput = 'Sorry, an error occurred while retrieving the data. Please try again later.';
    }
    
    return handlerInput.responseBuilder
      .speak(speakOutput)
      .reprompt('Please select a collection to hear about.')
      .getResponse();
  },
};

const EnterThemeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'EnterTheme'
    );
  },
  async handle(handlerInput) {
    const audioCollectionName = 'pandemic interviews';
    const themeName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'theme');
    
    try {
      const interviewDocs = await DB.collection('audio collections')
        .doc(audioCollectionName)
        .collection('interviews')
        .where('theme', '==', themeName.toLowerCase())
        .orderBy('themeOrder')
        .get();
      
      const interviewUrls = interviewDocs.docs.map(doc => doc.data().url);
      
      if (interviewUrls.length === 0) {
        const speakOutput = `Sorry, no interviews were found for the theme ${themeName}. Please try again with a different theme.`;
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .getResponse();
      } else {
        const response = handlerInput.responseBuilder
          .addAudioPlayerPlayDirective('REPLACE_ALL', interviewUrls[0], interviewUrls[0], 0, null)
          .getResponse();
        return response;
      }
    } catch (error) {
      console.error(`Error retrieving data from Firestore: ${error}`);
      const speakOutput = `Error retrieving data from Firestore: ${error}`;
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }
  },
};


const EnterCollectionIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'EnterCollection'
    );
  },
  async handle(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const collectionName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'CollectionName');
    sessionAttributes.collectionName = collectionName;

    try {
      const audioCollectionsRef = DB.collection('audio collections').doc(collectionName).collection('interviews');
      const mainPlaylistDocsRef = audioCollectionsRef
        .where('mainPlaylist', '==', true)
        .orderBy('mainPlaylistOrder');
      
      const mainPlaylistDocsSnapshot = await mainPlaylistDocsRef.get();
      const names = [];
      const urls = [];
        const themes = [];

    
      mainPlaylistDocsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.url) { 
          names.push(data.name);
          urls.push(data.url);
            themes.push(data.theme);

        }
      });
    
        
      const namesDocRef = DB.collection('names').doc('names');
      await namesDocRef.set({ names: names });
        
        const themesRef = DB.collection('themes').doc('themes');
        await themesRef.set({themes: themes})

      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
      return playAudioUrls(handlerInput, urls, 0);
    } catch (error) {
      console.error(`Error retrieving data from Firestore: ${error}`);
      const speakOutput = 'Sorry, an error occurred while retrieving the data. Please try again later.';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }
  },
};



const EnterInterviewsIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'EnterInterviews'
    );
  },
  async handle(handlerInput) {
    const audioCollectionName = 'pandemic interviews';
    const intervieweeName = Alexa.getSlotValue(handlerInput.requestEnvelope, 'interviewee');
    
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.intervieweeName = intervieweeName;

    try {
      const interviewDocs = await DB.collection('audio collections')
        .doc(audioCollectionName)
        .collection('interviews')
        .where('name', '==', intervieweeName.toLowerCase())
        .orderBy('playOrder')
        .get();
      
      const interviewUrls = interviewDocs.docs.map(doc => doc.data().url);

      if (interviewUrls.length === 0) {
        const speakOutput = `Sorry, no interviews were found for ${intervieweeName}. Please try again with a different name.`;
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .getResponse();
      } else {
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
        return playAudioUrls(handlerInput, interviewUrls, 0);
      }
    } catch (error) {
      console.error(`Error retrieving data from Firestore: ${error}`);
      const speakOutput = `Error retrieving data from Firestore: ${error}`;
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }
  },
};


async function playAudioUrls(handlerInput, urls, currentIndex = 0, offsetInMilliseconds = 0) {
  const { attributesManager } = handlerInput;
  const playbackInfo = {
    queue: urls,
    currentIndex: currentIndex,
    offsetInMilliseconds: offsetInMilliseconds,
  };

  attributesManager.setPersistentAttributes(playbackInfo);
  await attributesManager.savePersistentAttributes();

  const audioUrl = urls[currentIndex];
  const playBehavior = currentIndex === 0 ? 'REPLACE_ALL' : 'ENQUEUE';
  const expectedPreviousToken = currentIndex === 0 ? null : urls[currentIndex - 1];

  return handlerInput.responseBuilder
    .addAudioPlayerPlayDirective(playBehavior, audioUrl, audioUrl, playbackInfo.offsetInMilliseconds, expectedPreviousToken)
    .getResponse();
}




const AudioPlayerEventHandler = {
  canHandle(handlerInput) {
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    return requestType.startsWith('AudioPlayer.');
  },
  async handle(handlerInput) {
    const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
    const { attributesManager } = handlerInput;
    let playbackInfo = await attributesManager.getPersistentAttributes();

    switch(requestType) {
      case 'AudioPlayer.PlaybackStarted':
        return handlerInput.responseBuilder.getResponse();
      case 'AudioPlayer.PlaybackFinished':
        return handlerInput.responseBuilder.getResponse();
      case 'AudioPlayer.PlaybackStopped':
        const { request } = handlerInput.requestEnvelope;
        const { offsetInMilliseconds } = request;

        playbackInfo.offsetInMilliseconds = offsetInMilliseconds;
        await attributesManager.setPersistentAttributes(playbackInfo);
        await attributesManager.savePersistentAttributes();

        return handlerInput.responseBuilder.getResponse();
      case 'AudioPlayer.PlaybackNearlyFinished':
        const nextIndex = playbackInfo.currentIndex + 1;

        if (nextIndex < playbackInfo.queue.length) {
          return playAudioUrls(handlerInput, playbackInfo.queue, nextIndex);
        } else {
          return handlerInput.responseBuilder.getResponse();
        }
      case 'AudioPlayer.PlaybackFailed':
        console.log(JSON.stringify(handlerInput.requestEnvelope.request.error, null, 2));
        return handlerInput.responseBuilder.getResponse();
      default:
        return handlerInput.responseBuilder.getResponse();
    }
  }
};

const MoreFromCurrentIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'MoreFromCurrent'
    );
  },
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    let playbackInfo = await attributesManager.getPersistentAttributes();
    
    
    const namesSnapshot = await DB.collection('names').doc('names').get();
    const names = namesSnapshot.data().names;
    
    const currentName = names[playbackInfo.currentIndex];

    try {
      const interviewDocs = await DB.collection('audio collections')
        .doc('pandemic interviews') 
        .collection('interviews')
        .where('name', '==', currentName.toLowerCase())
        .orderBy('playOrder')
        .get();

      const interviewUrls = interviewDocs.docs.map(doc => doc.data().url);

      if (interviewUrls.length === 0) {
        const speakOutput = `Sorry, no additional interviews were found for ${currentName}.`;
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .getResponse();
      } else {
        return playAudioUrls(handlerInput, interviewUrls, 0);
      }
    } catch (error) {
      console.error(`Error retrieving data from Firestore: ${error}`);
      const speakOutput = `Error retrieving data from Firestore: ${error}`;
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }
  },
};

const PlayCurrentThemeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'PlayCurrentTheme'
    );
  },
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    let playbackInfo = await attributesManager.getPersistentAttributes();
    
    
    const themesDoc = await DB.collection('themes').doc('themes').get();
    let themes = themesDoc.data().themes;

    const currentTheme = themes[playbackInfo.currentIndex];

    try {
      const interviewDocs = await DB.collection('audio collections')
        .doc('pandemic interviews') 
        .collection('interviews')
        .where('theme', '==', currentTheme)
        //TODO update this to orderBy themeOrder (must create index in DB)
        .orderBy('playOrder')
        .get();

      const interviewUrls = interviewDocs.docs.map(doc => doc.data().url);

      if (interviewUrls.length === 0) {
        const speakOutput = `Sorry, no interviews were found for the theme ${currentTheme}.`;
        return handlerInput.responseBuilder
          .speak(speakOutput)
          .getResponse();
      } else {
        return playAudioUrls(handlerInput, interviewUrls, 0);
      }
    } catch (error) {
      console.error(`Error retrieving data from Firestore: ${error}`);
      const speakOutput = `Error retrieving data from Firestore: ${error}`;
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }
  },
};



const PauseIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.PauseIntent'
    );
  },
  handle(handlerInput) {
    const responseBuilder = handlerInput.responseBuilder;
    responseBuilder.addAudioPlayerStopDirective();
    return responseBuilder.getResponse();
  },
};

const ResumeIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.ResumeIntent'
    );
  },
  async handle(handlerInput) {
    const { attributesManager } = handlerInput;
    let playbackInfo = await attributesManager.getPersistentAttributes();

    const urls = playbackInfo.queue;
    const currentIndex = playbackInfo.currentIndex;
    const offsetInMilliseconds = playbackInfo.offsetInMilliseconds;

    return playAudioUrls(handlerInput, urls, currentIndex, offsetInMilliseconds);
  },
};


const SkipIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NextIntent'
    );
  },
  async handle(handlerInput) {
    
    const { attributesManager } = handlerInput;
    let playbackInfo = await attributesManager.getPersistentAttributes();

    
    if (playbackInfo.currentIndex + 1 < playbackInfo.queue.length) {
      playbackInfo.currentIndex += 1;

      
      const remainingUrls = playbackInfo.queue.slice(playbackInfo.currentIndex);

      
      attributesManager.setPersistentAttributes(playbackInfo);
      await attributesManager.savePersistentAttributes();

      
      return playAudioUrls(handlerInput, remainingUrls, 0);
    } else {
      
      const speakOutput = 'There is no next audio to play.';
      return handlerInput.responseBuilder
        .speak(speakOutput)
        .getResponse();
    }
  },
};



const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can\'t do anything. All this skill does is say: hello world. ';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder.getResponse();
    }
};
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('Say something else to continue with this skill.')
            .getResponse();
    }
};
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`ERROR: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SystemExceptionHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'System.ExceptionEncountered';
    },
    handle(handlerInput) {
        console.log(`~~~~ System exception encountered: ${JSON.stringify(handlerInput.requestEnvelope.request)}`);
    },
};

const LoadPersistentAttributesRequestInterceptor = {
  async process(handlerInput) {
    const { attributesManager } = handlerInput;
    const persistentAttributes = await attributesManager.getPersistentAttributes();

    console.log(`~~~~Request: ${JSON.stringify(handlerInput)}`);

    if (Object.keys(persistentAttributes).length === 0 ||
        !persistentAttributes.playbackInfo ||
        persistentAttributes.playbackInfo.queue.length === 0) {
    
      const playbackSetting = {
        loop: false,
        shuffle: false,
      };

      const playbackInfo = {
        queue: [],
        currentIndex: 0,
        offsetInMilliseconds: 0,
      };

      
      persistentAttributes.playbackSetting = playbackSetting;
      persistentAttributes.playbackInfo = playbackInfo;
      attributesManager.setPersistentAttributes(persistentAttributes);
      await attributesManager.savePersistentAttributes();
    }
  },
};


const SavePersistentAttributesResponseInterceptor = {
    async process(handlerInput) {
        await handlerInput.attributesManager.savePersistentAttributes();
    },
};

const LoggingRequestInterceptor = {
  process(handlerInput) {
    const { requestEnvelope } = handlerInput;
    console.log('Request:', JSON.stringify(requestEnvelope));
  }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        ListCollectionsIntentHandler,
        EnterCollectionIntentHandler,
        EnterInterviewsIntentHandler,
        EnterThemeIntentHandler,
        MoreFromCurrentIntentHandler,
        PlayCurrentThemeIntentHandler,
        SkipIntentHandler,
        SystemExceptionHandler,
        AudioPlayerEventHandler,
        PauseIntentHandler,
        ResumeIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler,
        )
    .addErrorHandlers(
        ErrorHandler,
        )
    .addRequestInterceptors(LoadPersistentAttributesRequestInterceptor, LoggingRequestInterceptor)
    .addResponseInterceptors(SavePersistentAttributesResponseInterceptor)
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION})
        })
    )
    
    .lambda();
