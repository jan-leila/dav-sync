# Sync Algorithm V2

## Sources

We have 4 record sources:

1. Local files. By scanning all files in the vault locally. Actually Obsidian provides an api directly returning this.
2. Remote files. By scanning all files on the remote service. Some services provide an api directly returning this, and some other services require the plugin scanning the folders recursively.
3. Local "delete-or-rename" history. It's recorded by using Obsidian's tracking api. So if users delete or rename files/folders outside Obsidian, we could do nothing.
4. Remote "delete" history. It's uploaded by the plugin in each sync.

Assuming all sources are reliable.

## Deal with them

We list all combinations mutually exclusive and collectively exhaustive.

### Files

In short, we collect four timestamps, and respect the max timestamp and its corresponding operation.

| t1             | t2             | t3             | t4             | local file to do | remote file to do | local del history to do | remote del history to do | equal to sync v2 branch |
| -------------- | -------------- | -------------- | -------------- | ---------------- | ----------------- | ----------------------- | ------------------------ | ----------------------- |
| modifiedTimeRemote   | modifiedTimeLocal    | deleteTimeRemote | deleteTimeLocal  | delIfExists    | delIfExists     | clean                   | uploadLocalDelHistory |                         |
| modifiedTimeLocal    | modifiedTimeRemote   | deleteTimeRemote | deleteTimeLocal  | delIfExists    | delIfExists     | clean                   | uploadLocalDelHistory |                         |
| modifiedTimeRemote   | deleteTimeRemote | modifiedTimeLocal    | deleteTimeLocal  | delIfExists    | delIfExists     | clean                   | uploadLocalDelHistory |                         |
| deleteTimeRemote | modifiedTimeRemote   | modifiedTimeLocal    | deleteTimeLocal  | delIfExists    | delIfExists     | clean                   | uploadLocalDelHistory |                         |
| modifiedTimeLocal    | deleteTimeRemote | modifiedTimeRemote   | deleteTimeLocal  | delIfExists    | delIfExists     | clean                   | uploadLocalDelHistory |                         |
| deleteTimeRemote | modifiedTimeLocal    | modifiedTimeRemote   | deleteTimeLocal  | delIfExists    | delIfExists     | clean                   | uploadLocalDelHistory | 8                       |
| modifiedTimeRemote   | modifiedTimeLocal    | deleteTimeLocal  | deleteTimeRemote | delIfExists    | delIfExists     | clean                   | keep                     |                         |
| modifiedTimeLocal    | modifiedTimeRemote   | deleteTimeLocal  | deleteTimeRemote | delIfExists    | delIfExists     | clean                   | keep                     |                         |
| modifiedTimeRemote   | deleteTimeLocal  | modifiedTimeLocal    | deleteTimeRemote | delIfExists    | delIfExists     | clean                   | keep                     |                         |
| deleteTimeLocal  | modifiedTimeRemote   | modifiedTimeLocal    | deleteTimeRemote | delIfExists    | delIfExists     | clean                   | keep                     |                         |
| modifiedTimeLocal    | deleteTimeLocal  | modifiedTimeRemote   | deleteTimeRemote | delIfExists    | delIfExists     | clean                   | keep                     |                         |
| deleteTimeLocal  | modifiedTimeLocal    | modifiedTimeRemote   | deleteTimeRemote | delIfExists    | delIfExists     | clean                   | keep                     |                         |
| modifiedTimeRemote   | deleteTimeRemote | deleteTimeLocal  | modifiedTimeLocal    | skip             | uploadLocal      | clean                   | clean                    |                         |
| deleteTimeRemote | modifiedTimeRemote   | deleteTimeLocal  | modifiedTimeLocal    | skip             | uploadLocal      | clean                   | clean                    | 10                      |
| modifiedTimeRemote   | deleteTimeLocal  | deleteTimeRemote | modifiedTimeLocal    | skip             | uploadLocal      | clean                   | clean                    |                         |
| deleteTimeLocal  | modifiedTimeRemote   | deleteTimeRemote | modifiedTimeLocal    | skip             | uploadLocal      | clean                   | clean                    |                         |
| deleteTimeRemote | deleteTimeLocal  | modifiedTimeRemote   | modifiedTimeLocal    | skip             | uploadLocal      | clean                   | clean                    | 2;3;4;5;6               |
| deleteTimeLocal  | deleteTimeRemote | modifiedTimeRemote   | modifiedTimeLocal    | skip             | uploadLocal      | clean                   | clean                    |                         |
| modifiedTimeLocal    | deleteTimeRemote | deleteTimeLocal  | modifiedTimeRemote   | downloadRemote  | skip              | clean                   | clean                    |                         |
| deleteTimeRemote | modifiedTimeLocal    | deleteTimeLocal  | modifiedTimeRemote   | downloadRemote  | skip              | clean                   | clean                    | 7;9                     |
| modifiedTimeLocal    | deleteTimeLocal  | deleteTimeRemote | modifiedTimeRemote   | downloadRemote  | skip              | clean                   | clean                    |                         |
| deleteTimeLocal  | modifiedTimeLocal    | deleteTimeRemote | modifiedTimeRemote   | downloadRemote  | skip              | clean                   | clean                    |                         |
| deleteTimeRemote | deleteTimeLocal  | modifiedTimeLocal    | modifiedTimeRemote   | downloadRemote  | skip              | clean                   | clean                    | 1;9                     |
| deleteTimeLocal  | deleteTimeRemote | modifiedTimeLocal    | modifiedTimeRemote   | downloadRemote  | skip              | clean                   | clean                    |                         |

### Folders

We actually do not use any folders' metadata. Thus the only relevant info is their names, while the mtime is actually ignorable.

1. Firstly generate all the files' plan. If any files exist, then it's parent folders all should exist. If the should-exist folder doesn't exist locally, the local should create it recursively. If the should-exist folder doesn't exist remotely, the remote should create it recursively.
2. Then, a folder is deletable, if and only if all the following conditions meet:

   - it shows up in the remote deletion history
   - it's empty, or all its sub-folders are deletable

   Some examples:

   - A user deletes the folder in device 1, then syncs from the device 1, then creates the same-name folder in device 2, then syncs from the device 2. The folder is deleted (again), on device 2.
   - A user deletes the folder in device 1, then syncs from the device 1, then creates the same-name folder in device 2, **then create a new file inside it,** then syncs from the device 2. The folder is **kept** instead of deleted because of the new file, on device 2.
   - A user deletes the folder in device 1, then syncs from the device 1, then do not touch the same-name folder in device 2, then syncs from the device 2. The folder and its untouched sub-files should be deleted on device 2.
