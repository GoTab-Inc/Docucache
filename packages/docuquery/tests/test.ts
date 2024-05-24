class Stuff {
  @Query({
    operationKey(filters: {open: boolean, mine: boolean}){
      return ['searchTabs', filters]
    }
  })
  searchTabs(filters: {open: boolean, mine: boolean}) {
    // ...
  }
}

const filters = {open: true, mine: true};

subscribe(['searchTabs', filters], (data) => {});

invalidate(['searchTabs', filters]);