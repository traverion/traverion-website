-- Registration documents may be up to 10 MB. The bucket limit is the storage enforcement.
update storage.buckets
set file_size_limit = 10485760
where id = 'supplier-verification';
