import { Connection, Schema } from 'mongoose';
import { set } from 'lodash';
import {
  PromisedApi,
  DEFAULT_SETTINGS,
  PluginOptions,
  CounterSchema,
  incrementFact,
  saveFact as save,
} from './internals';
import { rootDebug as debug } from './debug';

export * from './internals';

const defer = <T>() => {
  let resolve, reject;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return {
    promise,
    resolve,
    reject,
  };
};

let IdentityCounter;
const deferredApi = defer<PromisedApi>();
const api = { plugin };

const counterSchema = new Schema<CounterSchema>({
  model: { type: String, required: true },
  field: { type: String, required: true },
  groupingField: { type: String, default: '' },
  count: { type: Number, default: 0 },
});

counterSchema.index(
  {
    field: 1,
    groupingField: 1,
    model: 1,
  },
  {
    unique: true,
  }
);

export const promisedApi = deferredApi.promise;

// Initialize plugin by creating counter collection in database.
export function initialize(connection: Connection) {
  try {
    IdentityCounter = connection.model('IdentityCounter');
    deferredApi.resolve(api);
  } catch (ex) {
    if (ex.name === 'MissingSchemaError') {
      // Create model using new schema.
      IdentityCounter = connection.model('IdentityCounter', counterSchema);
      deferredApi.resolve(api);
    } else {
      deferredApi.reject(ex);
      throw ex;
    }
  }
}

// The function to use when invoking the plugin on a custom schema.
export function plugin<Model = {}>(
  schema: Schema<Model>,
  options?: PluginOptions<Model> | string | any
) {
  const compoundIndex = {};
  const settings = { ...DEFAULT_SETTINGS };
  const { nextCount, resetCount } = incrementFact(settings, IdentityCounter);

  /*
  If we don't have reference to the counterSchema or
  the IdentityCounter model then the plugin was most likely not
  initialized properly so throw an error.
   */
  if (!counterSchema || !IdentityCounter) {
    throw new Error('mongoose-auto-increment has not been initialized');
  }

  switch (typeof options) {
    // If string, the user chose to pass in just the model name.
    case 'string':
      settings.model = options;
      break;
    // If object, the user passed in a hash of options.
    case 'object':
      Object.assign(settings, options);
      break;
    default:
      break;
  }

  debug(() => settings);

  if (typeof settings.model !== 'string') {
    throw new Error('model must be set');
  }

  if (settings.field === '_id') {
    if (settings.groupingField.length) {
      throw new Error('Cannot use a grouping field with _id, choose a different field name.');
    }
  }

  if (!schema.path(settings.field) || settings.field === '_id') {
    schema.add(set({}, settings.field, { type: Number }));
  }

  // If a groupingField is specified, create a compound unique index.
  if (settings.groupingField.length) {
    compoundIndex[settings.field] = 1;
    compoundIndex[settings.groupingField] = 1;
    schema.index(compoundIndex, { unique: settings.unique });

    // Otherwise, add the unique index directly to the custom field.
  } else {
    // Add properties for field in schema.
    schema.path(settings.field).index({ unique: settings.unique });
  }

  // Add nextCount as both a method on documents and a static on the schema for convenience.
  // @ts-ignore
  schema.method('nextCount', nextCount);
  schema.static('nextCount', nextCount);

  // Add resetCount as both a method on documents and a static on the schema for convenience.
  // @ts-ignore
  schema.method('resetCount', resetCount);
  schema.static('resetCount', resetCount);

  // Every time documents in this schema are saved, run this logic.
  schema.pre('validate', function validate(next) {
    // Get reference to the document being saved.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const doc = this;
    // True if the counter collection has been updated and the document is ready to be saved.
    // let ready = false;
    // @ts-ignore
    const ranOnce = doc.__maiRanOnce === true;

    // Only do this if it is a new document & the field doesn't have a value set (see http://mongoosejs.com/docs/api.html#document_Document-isNew)
    if ((doc.isNew && ranOnce === false && !doc[settings.field]) || settings.migrate) {
      save({ doc, settings, IdentityCounter, next })();
      /*
      If the document does not have the field we're interested in or that field
        isn't a number AND the user did not specify that we should increment on
        updates, then just continue the save without any increment logic.
       */
    } else {
      next();
    }
  });
}
