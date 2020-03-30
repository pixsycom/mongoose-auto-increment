import mongoose from 'mongoose';
// import bases from 'bases';
import async from 'async';
import * as autoIncrement from '.';
import 'jest';

let connection;

mongoose.Promise = global.Promise;

beforeAll((done) => {
  connection = mongoose.createConnection(
    process.env.MONGO_URL || 'mongodb://localhost/unit_test'
  );
  connection.on('error', console.error.bind(console));
  connection.once('open', () => {
    autoIncrement.initialize(connection);
    done();
  });
});

afterAll((done) => {
  connection.db.dropDatabase((err) => {
    if (err) return done(err);
    connection.close(done);
  });
});

afterEach((done) => {
  try {
    connection.model('User').collection.drop(() => {
      delete connection.models.User;
      connection.model('IdentityCounter').collection.drop(done);
    });
  } catch (e) {
    done();
  }
});

describe('mongoose-auto-increment', () => {
  it('should increment the _id field on validate', (done) => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement.plugin, 'User');
    const User = connection.model('User', userSchema),
      user1 = new User({ name: 'Charlie', dept: 'Support' }),
      user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series(
      {
        user1(cb) {
          user1.validate(cb);
        },
        user2(cb) {
          user2.validate(cb);
        },
      },
      assert
    );

    // Assert
    function assert(err) {
      expect(err).toBeUndefined();
      expect(user1).toHaveProperty('_id', 0);
      expect(user2).toHaveProperty('_id', 1);
      done();
    }
  });

  it('should increment the _id field on save', (done) => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement.plugin, 'User');
    const User = connection.model('User', userSchema),
      user1 = new User({ name: 'Charlie', dept: 'Support' }),
      user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series(
      {
        user1(cb) {
          user1.save(cb);
        },
        user2(cb) {
          user2.save(cb);
        },
      },
      assert
    );

    // Assert
    function assert(err, results) {
      expect(err).toBeUndefined();
      expect(results.user1).toHaveProperty('_id', 0);
      expect(results.user2).toHaveProperty('_id', 1);
      done();
    }
  });

  it('should increment the specified field instead (Test 2)', (done) => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement.plugin, { model: 'User', field: 'userId' });
    const User = connection.model('User', userSchema),
      user1 = new User({ name: 'Charlie', dept: 'Support' }),
      user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series(
      {
        user1(cb) {
          user1.save(cb);
        },
        user2(cb) {
          user2.save(cb);
        },
      },
      assert
    );

    // Assert
    function assert(err, results) {
      expect(err).toBeUndefined();
      expect(results.user1).toHaveProperty('userId', 0);
      expect(results.user2).toHaveProperty('userId', 1);
      done();
    }
  });

  it(`should not throw duplicate key errors when creating counter
docs while multiple documents in parallel`, (done) => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement.plugin, { model: 'User', field: 'userId' });
    const User = connection.model('User', userSchema);

    const user1 = new User({ name: 'Charlie', dept: 'Support' });
    const user2 = new User({ name: 'Charlene', dept: 'Marketing' });
    const user3 = new User({ name: 'Parallel', dept: 'Something' });

    // Act
    Promise.all([user1.save(), user2.save(), user3.save()])
      .then(assert)
      .catch(done);

    // Assert
    function assert(results) {
      results.length.should.equal(3);
      done();
    }
  });

  it('should start counting at specified number (Test 3)', (done) => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });
    userSchema.plugin(autoIncrement.plugin, { model: 'User', startAt: 3 });
    const User = connection.model('User', userSchema),
      user1 = new User({ name: 'Charlie', dept: 'Support' }),
      user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series(
      {
        user1(cb) {
          user1.save(cb);
        },
        user2(cb) {
          user2.save(cb);
        },
      },
      assert
    );

    // Assert
    function assert(err, results) {
      expect(err).toBeUndefined();
      expect(results.user1).toHaveProperty('_id', 3);
      expect(results.user2).toHaveProperty('_id', 4);
      done();
    }
  });

  it('should increment by the specified amount (Test 4)', (done) => {
    // Arrange
    const userSchema = new mongoose.Schema({
      name: String,
      dept: String,
    });

    expect(() => {
      userSchema.plugin(autoIncrement.plugin);
    }).toThrow(Error);

    userSchema.plugin(autoIncrement.plugin, { model: 'User', incrementBy: 5 });
    const User = connection.model('User', userSchema),
      user1 = new User({ name: 'Charlie', dept: 'Support' }),
      user2 = new User({ name: 'Charlene', dept: 'Marketing' });

    // Act
    async.series(
      {
        user1(cb) {
          user1.save(cb);
        },
        user2(cb) {
          user2.save(cb);
        },
      },
      assert
    );

    // Assert
    function assert(err, results) {
      expect(err).toBeUndefined();
      expect(results.user1).toHaveProperty('_id', 0);
      expect(results.user2).toHaveProperty('_id', 5);
      done();
    }
  });

  describe('with incrementor groups', () => {
    it('should increment the specified field within the groupingField instead', (done) => {
      // Arrange
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      userSchema.plugin(autoIncrement.plugin, {
        model: 'User',
        field: 'userId',
        groupingField: 'dept',
      });
      const User = connection.model('User', userSchema),
        user1 = new User({ name: 'Charlie', dept: 'Support' }),
        user2 = new User({ name: 'Charlene', dept: 'Marketing' }),
        user3 = new User({ name: 'John', dept: 'Support' }),
        user4 = new User({ name: 'John', dept: 'Marketing' });

      // Act
      async.series(
        {
          user1(cb) {
            user1.save(cb);
          },
          user2(cb) {
            user2.save(cb);
          },
          user3(cb) {
            user3.save(cb);
          },
          user4(cb) {
            user4.save(cb);
          },
        },
        assert
      );

      // Assert
      function assert(err, results) {
        if (err) {
          done(err);
        } else {
          expect(err).toBeUndefined();
          expect(results.user1).toHaveProperty('userId', 0);
          expect(results.user2).toHaveProperty('userId', 0);
          expect(results.user3).toHaveProperty('userId', 1);
          expect(results.user4).toHaveProperty('userId', 1);
          done();
        }
      }
    });

    it('should not allow grouping fields with _id as the field', (done) => {
      // Arrange
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });

      try {
        userSchema.plugin(autoIncrement.plugin, {
          model: 'User',
          groupingField: 'dept',
        });
      } catch (err) {
        err.message.should.equal(
          'Cannot use a grouping field with _id, choose a different field name.'
        );
        done();
      }
    });
  });

  describe('helper function', () => {
    it('nextCount should return the next count for the model and field (Test 5)', (done) => {
      // Arrange
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      userSchema.plugin(autoIncrement.plugin, 'User');
      const User = connection.model('User', userSchema),
        user1 = new User({ name: 'Charlie', dept: 'Support' }),
        user2 = new User({ name: 'Charlene', dept: 'Marketing' });

      // Act
      async.series(
        {
          count1(cb) {
            user1.nextCount(cb);
          },
          user1(cb) {
            user1.save(cb);
          },
          count2(cb) {
            user1.nextCount(cb);
          },
          user2(cb) {
            user2.save(cb);
          },
          count3(cb) {
            user2.nextCount(cb);
          },
        },
        assert
      );

      // Assert
      function assert(err, results) {
        expect(err).toBeUndefined();
        results.count1.should.equal(0);
        expect(results.user1).toHaveProperty('_id', 0);
        results.count2.should.equal(1);
        expect(results.user2).toHaveProperty('_id', 1);
        results.count3.should.equal(2);
        done();
      }
    });

    it(`resetCount should cause the count to reset as
if there were no documents yet.`, (done) => {
      // Arrange
      const userSchema = new mongoose.Schema({
        name: String,
        dept: String,
      });
      userSchema.plugin(autoIncrement.plugin, 'User');
      const User = connection.model('User', userSchema),
        user = new User({ name: 'Charlie', dept: 'Support' });

      // Act
      async.series(
        {
          user(cb) {
            user.save(cb);
          },
          count1(cb) {
            user.nextCount(cb);
          },
          reset(cb) {
            user.resetCount(cb);
          },
          count2(cb) {
            user.nextCount(cb);
          },
        },
        assert
      );

      // Assert
      function assert(err, results) {
        expect(err).toBeUndefined();
        expect(results.user).toHaveProperty('_id', 0);
        results.count1.should.equal(1);
        results.reset.should.equal(0);
        results.count2.should.equal(0);
        done();
      }
    });

    describe('with string field and output filter', () => {
      it('should increment the counter value, only once', (done) => {
        // Arrange
        const userSchema = new mongoose.Schema({
          orderNumber: String,
          name: String,
          dept: String,
        });
        userSchema.plugin(autoIncrement.plugin, {
          model: 'User',
          field: 'orderNumber',
          outputFilter(value) {
            return `R${value}`;
          },
        });
        const User = connection.model('User', userSchema),
          user1 = new User({ name: 'Charlie', dept: 'Support' });

        let initialId;

        // Act
        user1
          .validate()
          .then(() => {
            initialId = user1.orderNumber;
            return user1.validate();
          })
          .then(() => {
            user1.save(assert);
          })
          .catch(done);

        // Assert
        function assert(err, result) {
          expect(err).toBeUndefined();
          expect(result).toHaveProperty('orderNumber', initialId);
          done();
        }
      });
    });

    describe('with incrementor groups', () => {
      it(`nextCount should return the next count
for the model, field, and groupingField`, (done) => {
        // Arrange
        const userSchema = new mongoose.Schema({
          name: String,
          dept: String,
        });
        userSchema.plugin(autoIncrement.plugin, {
          model: 'User',
          field: 'userId',
          groupingField: 'dept',
        });
        const User = connection.model('User', userSchema),
          user1 = new User({ name: 'Charlie', dept: 'Support' }),
          user2 = new User({ name: 'Charlene', dept: 'Marketing' });

        // Act
        async.series(
          {
            count1(cb) {
              user1.nextCount(user1.dept, cb);
            },
            user1(cb) {
              user1.save(cb);
            },
            count2(cb) {
              user1.nextCount(user1.dept, cb);
            },
            user2(cb) {
              user2.save(cb);
            },
            count3(cb) {
              user2.nextCount(user2.dept, cb);
            },
          },
          assert
        );

        // Assert
        function assert(err, results) {
          if (err) {
            done(err);
          }
          expect(err).toBeUndefined();
          results.count1.should.equal(0);
          expect(results.user1).toHaveProperty('userId', 0);
          results.count2.should.equal(1);
          expect(results.user2).toHaveProperty('userId', 0);
          results.count3.should.equal(1);
          done();
        }
      });
    });
  });
});
