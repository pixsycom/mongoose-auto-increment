import { Document, Model, Schema } from 'mongoose';
import { rootDebug } from './debug';

const debug = rootDebug.spawn('internals');

export interface PromisedApi {
  plugin: <Model = {}>(schema: Schema<Model>, options?: any) => void;
}

export interface CounterSchema {
  model: string;
  field: string;
  groupingField?: string;
  count?: number;
}

export interface PluginOptions<Model> {
  // If this is to be run on a migration for existing records.
  // Only set this on migration processes.
  migrate: boolean;
  model: Model; // The model to configure the plugin for.
  field: string; // The field the plugin should track.
  // The field by which to group documents,
  // allowing for each grouping to be incremented separately.
  groupingField: string;
  startAt: number; // The number the count should start at.
  incrementBy: number; // The number by which to increment the count each time.
  unique: boolean; // Should we create a unique index for the field,
  outputFilter: (_: number) => number; // function that modifies the output of the counter.
}

export const DEFAULT_SETTINGS = {
  migrate: false,
  model: null,
  field: '_id',
  groupingField: '',
  startAt: 0,
  incrementBy: 1,
  unique: true,
  outputFilter: undefined,
};

export const incrementFact = <M>(
  settings: PluginOptions<M>,
  IdentityCounter: Model<CounterSchema & Document>
) => {
  return { nextCount, resetCount };

  // Declare a function to get the next counter for the model/schema.
  function nextCount(...args) {
    const d = debug.spawn('nextCount');
    let groupingFieldValue = '';
    let callback;

    if (typeof args[0] !== 'function') {
      groupingFieldValue = args[0].toString();
      callback = args[1];
    } else {
      callback = args[0];
    }

    IdentityCounter.findOne(
      {
        model: settings.model,
        field: settings.field,
        groupingField: groupingFieldValue,
      },
      (err, counter) => {
        if (err) return callback(err);

        d(() => ({
          count: counter ? counter.count : null,
          startAt: settings.startAt,
          incrementBy: settings.incrementBy,
        }));
        callback(
          null,
          counter === null ? settings.startAt : counter.count + settings.incrementBy
        );
      }
    );
  }

  // Declare a function to reset counter at the start value - increment value.
  function resetCount(...args) {
    const d = debug.spawn('nextCount');
    let groupingFieldValue = '';
    let callback;

    if (typeof args[0] !== 'function') {
      groupingFieldValue = args[0].toString();
      callback = args[1];
    } else {
      callback = args[0];
    }

    IdentityCounter.findOneAndUpdate(
      { model: settings.model, field: settings.field, groupingField: groupingFieldValue },
      { count: settings.startAt - settings.incrementBy },
      { new: true }, // new: true specifies that the callback should get the updated counter.
      (err) => {
        if (err) return callback(err);
        d(() => ({ startAt: settings.startAt }));
        callback(null, settings.startAt);
      }
    );
  }
};

export interface SaveFactProps<M> {
  doc: Document;
  settings: PluginOptions<M>;
  IdentityCounter: Model<CounterSchema & Document>;
  next: (_?: Error) => void;
}

export const saveFact = <M>({ doc, settings, IdentityCounter, next }: SaveFactProps<M>) => {
  return function save(): Promise<void> {
    // Find the counter for this model and the relevant field.
    return IdentityCounter.findOne({
      model: settings.model,
      field: settings.field,
      groupingField: doc.get(settings.groupingField) || '',
    })
      .exec()
      .then((counter) => {
        if (counter) {
          return counter;
        }

        // If no counter exists then create one and save it.
        return new IdentityCounter({
          model: settings.model,
          field: settings.field,
          groupingField: doc.get(settings.groupingField) || '',
          count: settings.startAt - settings.incrementBy,
        }).save();
      })
      .then(() => {
        // check that a number has already been provided,
        // and update the counter to that number if it is
        // greater than the current count
        if (typeof doc.get(settings.field) === 'number') {
          return IdentityCounter.findOneAndUpdate(
            {
              model: settings.model,
              field: settings.field,
              groupingField: doc.get(settings.groupingField) || '',
              count: { $lt: doc.get(settings.field) },
            },
            {
              // Change the count of the value found to the new field value.
              count: doc.get(settings.field),
            }
          )
            .exec()
            .then(() => undefined);
        }
        // Find the counter collection entry for this model and field and update it.
        return IdentityCounter.findOneAndUpdate(
          {
            model: settings.model,
            field: settings.field,
            groupingField: doc.get(settings.groupingField) || '',
          },
          {
            // Increment the count by `incrementBy`.
            $inc: { count: settings.incrementBy },
          },
          {
            // new:true specifies that the callback should
            // get the counter AFTER it is updated (incremented).
            new: true,
          }
        )
          .exec()
          .then((updatedIdentityCounter) => {
            let { count } = updatedIdentityCounter;

            // if an output filter was provided, apply it.
            if (typeof settings.outputFilter === 'function') {
              count = settings.outputFilter(updatedIdentityCounter.count);
            }

            // If there are no errors then go ahead and
            // set the document's field to the current count.
            doc.set(settings.field, count);
            // @ts-ignore
            doc.__maiRanOnce = true;
          });
      })
      .then(next)
      .catch((err) => {
        if (err.name === 'MongoError' && err.code === 11000) {
          setTimeout(save, 5);
        } else {
          next(err);
        }
      });
  };
};
